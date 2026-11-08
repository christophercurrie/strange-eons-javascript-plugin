package org.strangeeons.graaljs;

import java.io.FileNotFoundException;
import java.lang.invoke.MethodHandles;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.net.URL;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import org.graalvm.polyglot.Engine;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.PolyglotException;
import org.graalvm.polyglot.Source;
import org.graalvm.polyglot.SourceSection;
import org.graalvm.polyglot.Value;
import org.strangeeons.scripts.ScriptException;
import org.strangeeons.scripts.ScriptSession;

/**
 * {@link ScriptSession} backed by a GraalJS context.
 *
 * <h2>Contexts</h2>
 * A session runs in the {@link ModuleContext} of the first plug-in module it
 * loads, by {@link #eval} of a {@code res://} module or by
 * {@link #createHandler}: sessions that load modules from the same resource
 * folder share a context, and with it module state. A session that first
 * evaluates other source gets a context of its own. Bindings made before then
 * are applied to the context when it is chosen.
 *
 * <h2>Scripts and modules</h2>
 * Sources whose name ends in {@code .mjs} are evaluated as ES modules; all
 * others as classic scripts. {@link #call} resolves a name against the
 * exports of the most recently evaluated module first, then against the
 * global scope. A plug-in can therefore write either
 * {@code function initialize() {}} in a classic script or
 * {@code export function initialize() {}} in a module.
 *
 * <h2>Host access</h2>
 * Plug-ins remain trusted code with IO and threads, but this boundary keeps
 * them on the supported API; it is not a sandbox. Scripts look up classes
 * through a filtered {@code Java} global that excludes application classes,
 * and reach the application through {@code strange-eons/legacy}. Objects that
 * library returns keep their public methods. {@code Object.getClass} and
 * reflection are denied for all code in the context.
 *
 * <h2>Threading</h2>
 * A JS context cannot be entered by two threads at once. Entry points are
 * synchronized on the context, so concurrent host calls from its sessions
 * serialize instead of failing. Closing the last session of a context
 * cancels any running script rather than waiting for it.
 */
final class GraalJSSession implements ScriptSession {

    private static final String JS = ModuleContext.JS;
    private static final String MODULE_MIME = ModuleContext.MODULE_MIME;

    private static final HostAccess HOST_ACCESS = HostAccess.newBuilder(HostAccess.ALL)
            .denyAccess(Object.class, false)
            .denyAccess(Class.class)
            .denyAccess(ClassLoader.class)
            .denyAccess(Field.class)
            .denyAccess(Method.class)
            .denyAccess(Constructor.class)
            .denyAccess(MethodHandles.class)
            .denyAccess(MethodHandles.Lookup.class)
            // Rhino narrows any number to a float parameter; GraalJS refuses lossy conversions
            // ahead of truncating it to an int, as Rhino ranks float above int
            .targetTypeMapping(Double.class, Float.class, Objects::nonNull, Double::floatValue,
                    HostAccess.TargetMappingPrecedence.LOW)
            // truncates a number toward zero for an int or long parameter it fits
            .targetTypeMapping(Double.class, Integer.class,
                    d -> fitsInteger(d, Integer.MIN_VALUE, Integer.MAX_VALUE), d -> (int) (double) d,
                    HostAccess.TargetMappingPrecedence.LOWEST)
            .targetTypeMapping(Double.class, Long.class,
                    d -> fitsInteger(d, Long.MIN_VALUE, Long.MAX_VALUE), d -> (long) (double) d,
                    HostAccess.TargetMappingPrecedence.LOWEST)
            // and passes a number to a String parameter as its script text
            .targetTypeMapping(Value.class, String.class, Value::isNumber, n -> numberText(n.asDouble()),
                    HostAccess.TargetMappingPrecedence.LOWEST)
            .build();

    private static final String RESOURCE_SCHEME = "res://";

    /** Whether a number, truncated toward zero, lies in [min, max]; false for null. */
    static boolean fitsInteger(Double d, double min, double max) {
        if (d == null) {
            return false;
        }
        double whole = d < 0 ? Math.ceil(d) : Math.floor(d);
        return whole >= min && whole <= max;
    }

    /** A number as script code would convert it to a string. */
    static String numberText(double d) {
        if (Double.isNaN(d)) {
            return "NaN";
        }
        if (Double.isInfinite(d)) {
            return d > 0 ? "Infinity" : "-Infinity";
        }
        if (d == 0) {
            return "0";
        }
        BigDecimal b = new BigDecimal(Double.toString(d)).stripTrailingZeros();
        double a = Math.abs(d);
        if (a >= 1e-6 && a < 1e21) {
            return b.toPlainString();
        }
        String digits = b.unscaledValue().abs().toString();
        int exponent = digits.length() - 1 - b.scale();
        String mantissa = digits.length() == 1 ? digits : digits.charAt(0) + "." + digits.substring(1);
        return (d < 0 ? "-" : "") + mantissa + "e" + (exponent < 0 ? "-" : "+") + Math.abs(exponent);
    }

    private final Engine engine;
    private final ClassLoader hostClassLoader;
    private final Function<String, URL> resources;
    /** The context, once the session has chosen one; guarded by this. */
    private ModuleContext context;
    /** Bindings made before the context was chosen; guarded by this. */
    private final Map<String, Object> pendingBindings = new LinkedHashMap<>();
    private volatile boolean closed;
    /** Namespace object of the last module evaluated, or null. */
    private Value exports;

    GraalJSSession(Engine engine, ClassLoader hostClassLoader, Function<String, URL> resources) {
        this.engine = engine;
        this.hostClassLoader = hostClassLoader;
        this.resources = resources;
    }

    /**
     * Returns the session's context, choosing it on first use: the shared
     * context of {@code resourceName}'s folder, or a private one if it is
     * {@code null}.
     */
    private synchronized ModuleContext context(String resourceName) throws ScriptException {
        ensureOpen();
        if (context == null) {
            String folder = resourceName == null ? null : ModuleContext.folderOf(resourceName);
            context = ModuleContext.acquire(folder, engine, hostClassLoader, resources, HOST_ACCESS);
            synchronized (context) {
                pendingBindings.forEach(context.context().getBindings(JS)::putMember);
            }
            pendingBindings.clear();
        }
        return context;
    }

    /** The resource name of a {@code res://} or plain resource path, or null for other names. */
    private static String resourceName(String script) {
        if (script == null) {
            return null;
        }
        if (script.startsWith(RESOURCE_SCHEME)) {
            return script.substring(RESOURCE_SCHEME.length());
        }
        return script.contains(":") ? null : script;
    }

    @Override
    public Object eval(String source, String sourceName) throws ScriptException {
        boolean module = isModule(sourceName);
        boolean resource = module && sourceName.startsWith(RESOURCE_SCHEME);
        ModuleContext mc = context(resource ? resourceName(sourceName) : null);
        synchronized (mc) {
            ensureOpen();
            if (resource) {
                // load the module by path, so its relative imports resolve
                exports = moduleNamespace(mc, sourceName, sourceName);
                return toHost(exports);
            }
            Source.Builder b = Source.newBuilder(JS, source, sourceName == null ? "<eval>" : sourceName);
            if (module) {
                b.mimeType(MODULE_MIME);
            }
            try {
                Value result = mc.context().eval(b.buildLiteral());
                if (module) {
                    exports = result;
                }
                return toHost(result);
            } catch (PolyglotException e) {
                throw translate(e, sourceName);
            }
        }
    }

    @Override
    public Object call(String name, Object... args) throws ScriptException {
        ModuleContext mc = context(null);
        synchronized (mc) {
            ensureOpen();
            Value fn = resolve(mc, name);
            if (fn == null) {
                throw new ScriptException("function not defined: " + name);
            }
            return invoke(fn, name, args);
        }
    }

    @Override
    public Object callIfDefined(String name, Object... args) throws ScriptException {
        ModuleContext mc = context(null);
        synchronized (mc) {
            ensureOpen();
            Value fn = resolve(mc, name);
            return fn == null ? null : invoke(fn, name, args);
        }
    }

    @Override
    public void bind(String name, Object value) {
        ModuleContext mc;
        synchronized (this) {
            if (closed) {
                throw new IllegalStateException("session is closed");
            }
            if (context == null) {
                pendingBindings.put(name, value);
                return;
            }
            mc = context;
        }
        synchronized (mc) {
            mc.context().getBindings(JS).putMember(name, value);
        }
    }

    /**
     * Constructs a class exported by a plug-in module. The returned object
     * follows the conventions of Strange Rhino handlers: a method the class
     * doesn't define does nothing and returns zero or {@code null}, unless the
     * interface gives it a default. Calls hold the context's lock, since a JS
     * context cannot be entered by two threads at once, and do nothing once the
     * session is closed.
     */
    @Override
    public <T> T createHandler(String spec, Class<T> type) throws ScriptException {
        ensureOpen();
        if (!type.isInterface()) {
            throw new ScriptException("not an interface: " + type.getName());
        }
        int colon = spec.lastIndexOf(':');
        if (colon < 0) {
            throw new ScriptException("expected path:ExportedName: " + spec);
        }
        String script = spec.substring(0, colon);
        String export = spec.substring(colon + 1);
        ModuleContext mc = context(resourceName(script));
        Value instance;
        synchronized (mc) {
            ensureOpen();
            Value constructor = moduleNamespace(mc, script, spec).getMember(export);
            if (constructor == null || !constructor.canInstantiate()) {
                throw new ScriptException("module does not export a class: " + spec);
            }
            try {
                instance = constructor.newInstance();
            } catch (PolyglotException e) {
                throw translate(e, spec);
            }
        }
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type},
                (proxy, method, args) -> invokeHandler(mc, instance, proxy, method, args)));
    }

    /** Imports a plug-in module by resource name and returns its namespace. */
    private static Value moduleNamespace(ModuleContext mc, String script, String spec) throws ScriptException {
        if (script.contains(":") && !script.startsWith(RESOURCE_SCHEME)) {
            throw new ScriptException("only res: and plain resource paths are supported: " + spec);
        }
        String name = script.startsWith(RESOURCE_SCHEME) ? script.substring(RESOURCE_SCHEME.length()) : script;
        Path path;
        try {
            path = BundledModuleFileSystem.resourcePath(name);
        } catch (InvalidPathException e) {
            throw new ScriptException(spec, e);
        }
        if (!mc.fileSystem().hasResource(path)) {
            throw new ScriptException(spec, new FileNotFoundException(script));
        }
        String specifier = path.toString().replace('\\', '/').replace("'", "\\'");
        Source source = Source.newBuilder(JS, "import * as handlerModule from '" + specifier + "';"
                + " export { handlerModule };", "<handler module>").mimeType(MODULE_MIME).buildLiteral();
        try {
            return mc.context().eval(source).getMember("handlerModule");
        } catch (PolyglotException e) {
            throw translate(e, spec);
        }
    }

    private Object invokeHandler(ModuleContext mc, Value instance, Object proxy, Method method, Object[] args)
            throws Throwable {
        if (method.getDeclaringClass() == Object.class) {
            return switch (method.getName()) {
                case "equals" -> proxy == args[0];
                case "hashCode" -> System.identityHashCode(proxy);
                default -> "script handler of " + proxy.getClass().getInterfaces()[0].getName();
            };
        }
        synchronized (mc) {
            Class<?> returnType = method.getReturnType();
            if (closed) {
                return emptyValue(returnType);
            }
            if (!instance.canInvokeMember(method.getName())) {
                return method.isDefault()
                        ? InvocationHandler.invokeDefault(proxy, method, args)
                        : emptyValue(returnType);
            }
            try {
                Value result = instance.invokeMember(method.getName(), args == null ? new Object[0] : args);
                return returnType == void.class || result.isNull() ? emptyValue(returnType) : result.as(returnType);
            } catch (PolyglotException e) {
                if (e.isHostException() && e.asHostException() instanceof RuntimeException host) {
                    throw host;
                }
                throw new IllegalStateException(translate(e, method.getName() + "()").getMessage(), e);
            }
        }
    }

    private static Object emptyValue(Class<?> type) {
        return type.isPrimitive() && type != void.class ? Array.get(Array.newInstance(type, 1), 0) : null;
    }

    @Override
    public void close() {
        ModuleContext mc;
        synchronized (this) {
            if (closed) {
                return;
            }
            closed = true;
            exports = null;
            mc = context;
        }
        if (mc != null) {
            mc.release();
        }
    }

    static boolean isModule(String sourceName) {
        return sourceName != null && sourceName.endsWith(".mjs");
    }

    private Value resolve(ModuleContext mc, String name) {
        if (exports != null && exports.hasMember(name)) {
            Value v = exports.getMember(name);
            if (v != null && v.canExecute()) {
                return v;
            }
        }
        Value v = mc.context().getBindings(JS).getMember(name);
        return v != null && v.canExecute() ? v : null;
    }

    private Object invoke(Value fn, String name, Object[] args) throws ScriptException {
        try {
            return toHost(fn.execute(args == null ? new Object[0] : args));
        } catch (PolyglotException e) {
            throw translate(e, name + "()");
        }
    }

    private void ensureOpen() throws ScriptException {
        if (closed) {
            throw new ScriptException("session is closed");
        }
    }

    /**
     * Converts a guest value to what SE's host code expects: Java
     * primitives' boxes for booleans, strings and numbers (as the narrowest
     * of Integer/Long/Double), the original object for host objects, and
     * polyglot's default mapping (Map/List/Function views) for the rest.
     * Those views stay bound to this context and fail after {@link #close}.
     */
    static Object toHost(Value v) {
        if (v == null || v.isNull()) {
            return null;
        }
        if (v.isHostObject()) {
            return v.asHostObject();
        }
        if (v.isBoolean()) {
            return v.asBoolean();
        }
        if (v.isString()) {
            return v.asString();
        }
        if (v.isNumber()) {
            if (v.fitsInInt()) {
                return v.asInt();
            }
            if (v.fitsInLong()) {
                return v.asLong();
            }
            return v.asDouble();
        }
        return v.as(Object.class);
    }

    static ScriptException translate(PolyglotException e, String where) {
        StringBuilder msg = new StringBuilder(e.isSyntaxError() ? "syntax error" : "script error");
        SourceSection loc = e.getSourceLocation();
        if (loc == null) {
            // Errors thrown by guest code carry no location of their own;
            // use the innermost guest frame instead.
            for (PolyglotException.StackFrame f : e.getPolyglotStackTrace()) {
                if (f.isGuestFrame() && f.getSourceLocation() != null) {
                    loc = f.getSourceLocation();
                    break;
                }
            }
        }
        if (loc != null && loc.isAvailable()) {
            msg.append(" at ").append(loc.getSource().getName()).append(':').append(loc.getStartLine());
        } else if (where != null) {
            msg.append(" in ").append(where);
        }
        msg.append(": ").append(e.getMessage());
        Throwable cause = e.isHostException() ? e.asHostException() : e;
        return new ScriptException(msg.toString(), cause);
    }
}
