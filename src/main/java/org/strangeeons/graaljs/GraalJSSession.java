package org.strangeeons.graaljs;

import java.util.concurrent.atomic.AtomicBoolean;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Engine;
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
 * Plug-ins are trusted code, as they are under Strange Rhino: the context
 * gets full host access ({@code Java.type}, IO, threads). Java classes are
 * looked up through this plug-in's own classloader, whose ancestors are the
 * SE library tier and the application.
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

    private final Context context;
    private final AtomicBoolean closed = new AtomicBoolean();
    /** Namespace object of the last module evaluated, or null. */
    private Value exports;

    GraalJSSession(Engine engine, ClassLoader hostClassLoader) {
        context = Context.newBuilder(JS)
                .engine(engine)
                .allowAllAccess(true)
                .allowIO(IOAccess.newBuilder()
                        .fileSystem(new BundledModuleFileSystem(hostClassLoader))
                        .build())
                .hostClassLoader(hostClassLoader)
                // Make eval() of a module return its namespace object so
                // exported functions are reachable from call().
                .allowExperimentalOptions(true)
                .option("js.esm-eval-returns-exports", "true")
                .build();
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
