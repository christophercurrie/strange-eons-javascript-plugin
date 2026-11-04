package org.strangeeons.graaljs;

import java.io.FileNotFoundException;
import java.lang.invoke.MethodHandles;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.URL;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Function;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Engine;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.PolyglotException;
import org.graalvm.polyglot.Source;
import org.graalvm.polyglot.SourceSection;
import org.graalvm.polyglot.Value;
import org.graalvm.polyglot.io.IOAccess;
import org.strangeeons.scripts.ScriptException;
import org.strangeeons.scripts.ScriptSession;

/**
 * {@link ScriptSession} backed by one GraalJS {@link Context}.
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
 * synchronized on the session, so concurrent host calls serialize instead of
 * failing. {@link #close} is not synchronized: it cancels any running
 * script rather than waiting for it.
 */
final class GraalJSSession implements ScriptSession {

    private static final String JS = "js";
    private static final String MODULE_MIME = "application/javascript+module";

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
            .targetTypeMapping(Double.class, Float.class, null, Double::floatValue,
                    HostAccess.TargetMappingPrecedence.LOWEST)
            .build();

    private static final String RESOURCE_SCHEME = "res://";

    private final Context context;
    private final BundledModuleFileSystem fileSystem;
    private final AtomicBoolean closed = new AtomicBoolean();
    /** Namespace object of the last module evaluated, or null. */
    private Value exports;

    GraalJSSession(Engine engine, ClassLoader hostClassLoader, Function<String, URL> resources) {
        fileSystem = new BundledModuleFileSystem(hostClassLoader, resources);
        context = Context.newBuilder(JS)
                .engine(engine)
                .allowAllAccess(true)
                .allowHostAccess(HOST_ACCESS)
                .allowHostClassLoading(false)
                .allowIO(IOAccess.newBuilder().fileSystem(fileSystem).build())
                .hostClassLoader(hostClassLoader)
                // Make eval() of a module return its namespace object so
                // exported functions are reachable from call().
                .allowExperimentalOptions(true)
                .option("js.esm-eval-returns-exports", "true")
                .option("js.java-package-globals", "false")
                .option("js.polyglot-builtin", "false")
                // Bean getters and setters read as properties, as in Rhino;
                // compat mode otherwise falls back to ES5 and drops Intl.
                .option("js.nashorn-compat", "true")
                .option("js.ecmascript-version", "latest")
                .option("js.intl-402", "true")
                .build();
        context.eval(Source.newBuilder(JS, "import 'strange-eons/internal/host';", "<host boundary>")
                .mimeType(MODULE_MIME).buildLiteral());
        fileSystem.seal();
    }

    @Override
    public synchronized Object eval(String source, String sourceName) throws ScriptException {
        ensureOpen();
        boolean module = isModule(sourceName);
        Source.Builder b = Source.newBuilder(JS, source, sourceName == null ? "<eval>" : sourceName);
        if (module) {
            b.mimeType(MODULE_MIME);
        }
        try {
            Value result = context.eval(b.buildLiteral());
            if (module) {
                exports = result;
            }
            return toHost(result);
        } catch (PolyglotException e) {
            throw translate(e, sourceName);
        }
    }

    @Override
    public synchronized Object call(String name, Object... args) throws ScriptException {
        ensureOpen();
        Value fn = resolve(name);
        if (fn == null) {
            throw new ScriptException("function not defined: " + name);
        }
        return invoke(fn, name, args);
    }

    @Override
    public synchronized Object callIfDefined(String name, Object... args) throws ScriptException {
        ensureOpen();
        Value fn = resolve(name);
        return fn == null ? null : invoke(fn, name, args);
    }

    @Override
    public synchronized void bind(String name, Object value) {
        if (closed.get()) {
            throw new IllegalStateException("session is closed");
        }
        context.getBindings(JS).putMember(name, value);
    }

    /**
     * Constructs a class exported by a plug-in module. The returned object
     * follows the conventions of Strange Rhino handlers: a method the class
     * doesn't define does nothing and returns zero or {@code null}, unless the
     * interface gives it a default. Calls hold the session's lock, since a JS
     * context cannot be entered by two threads at once, and do nothing once the
     * session is closed.
     */
    @Override
    public synchronized <T> T createHandler(String spec, Class<T> type) throws ScriptException {
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
        Value constructor = exportedMember(script, export, spec);
        if (constructor == null || !constructor.canInstantiate()) {
            throw new ScriptException("module does not export a class: " + spec);
        }
        Value instance;
        try {
            instance = constructor.newInstance();
        } catch (PolyglotException e) {
            throw translate(e, spec);
        }
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type},
                (proxy, method, args) -> invokeHandler(instance, proxy, method, args)));
    }

    private Value exportedMember(String script, String export, String spec) throws ScriptException {
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
        if (!fileSystem.hasResource(path)) {
            throw new ScriptException(spec, new FileNotFoundException(script));
        }
        String specifier = path.toString().replace('\\', '/').replace("'", "\\'");
        Source source = Source.newBuilder(JS, "import * as handlerModule from '" + specifier + "';"
                + " export { handlerModule };", "<handler module>").mimeType(MODULE_MIME).buildLiteral();
        try {
            return context.eval(source).getMember("handlerModule").getMember(export);
        } catch (PolyglotException e) {
            throw translate(e, spec);
        }
    }

    private Object invokeHandler(Value instance, Object proxy, Method method, Object[] args) throws Throwable {
        if (method.getDeclaringClass() == Object.class) {
            return switch (method.getName()) {
                case "equals" -> proxy == args[0];
                case "hashCode" -> System.identityHashCode(proxy);
                default -> "script handler of " + proxy.getClass().getInterfaces()[0].getName();
            };
        }
        synchronized (this) {
            Class<?> returnType = method.getReturnType();
            if (closed.get()) {
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
        if (closed.compareAndSet(false, true)) {
            exports = null;
            // cancelIfExecuting = true: a runaway script must not be able to
            // block plug-in unload.
            context.close(true);
        }
    }

    static boolean isModule(String sourceName) {
        return sourceName != null && sourceName.endsWith(".mjs");
    }

    private Value resolve(String name) {
        if (exports != null && exports.hasMember(name)) {
            Value v = exports.getMember(name);
            if (v != null && v.canExecute()) {
                return v;
            }
        }
        Value v = context.getBindings(JS).getMember(name);
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
        if (closed.get()) {
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
