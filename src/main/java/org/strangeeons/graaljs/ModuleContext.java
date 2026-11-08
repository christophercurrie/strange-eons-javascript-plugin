package org.strangeeons.graaljs;

import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Engine;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.Source;
import org.graalvm.polyglot.io.IOAccess;

/**
 * A GraalJS {@link Context} and the module file system it loads plug-in
 * modules from, shared by the sessions of one plug-in.
 *
 * <p>Sessions that load modules from the same resource folder, such as a
 * plug-in's entry module and its card handlers under {@code MyPlugin/}, share
 * one context: each module runs once, and its state is shared by them all.
 * Other sessions get a context of their own. A context closes when the last
 * session using it closes.
 *
 * <p>A JS context cannot be entered by two threads at once, so sessions
 * synchronize on their context while running scripts.
 */
final class ModuleContext {

    static final String JS = "js";
    static final String MODULE_MIME = "application/javascript+module";

    private static final Map<String, ModuleContext> SHARED = new HashMap<>();

    private final String key;
    private final Context context;
    private final BundledModuleFileSystem fileSystem;
    /** Open sessions using the context; guarded by SHARED. */
    private int sessions = 1;

    private ModuleContext(String key, Engine engine, ClassLoader hostClassLoader, Function<String, URL> resources,
            HostAccess hostAccess) {
        this.key = key;
        fileSystem = new BundledModuleFileSystem(hostClassLoader, resources);
        context = Context.newBuilder(JS)
                .engine(engine)
                .allowAllAccess(true)
                .allowHostAccess(hostAccess)
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

    /**
     * Returns the context for resources in the folder {@code key}, creating it
     * if no open session uses one, or a new private context if {@code key} is
     * {@code null}. Each call counts as one session until {@link #release}.
     */
    static ModuleContext acquire(String key, Engine engine, ClassLoader hostClassLoader,
            Function<String, URL> resources, HostAccess hostAccess) {
        if (key == null) {
            return new ModuleContext(null, engine, hostClassLoader, resources, hostAccess);
        }
        synchronized (SHARED) {
            ModuleContext shared = SHARED.get(key);
            if (shared != null) {
                ++shared.sessions;
                return shared;
            }
            shared = new ModuleContext(key, engine, hostClassLoader, resources, hostAccess);
            SHARED.put(key, shared);
            return shared;
        }
    }

    /**
     * Ends one session's use of the context, closing it after the last.
     * {@code cancelIfExecuting} lets a runaway script not block plug-in unload.
     */
    void release() {
        synchronized (SHARED) {
            if (--sessions > 0) {
                return;
            }
            if (key != null) {
                SHARED.remove(key);
            }
        }
        context.close(true);
    }

    /**
     * The resource folder that names the shared context for a module, or
     * {@code null} if the name has no folder.
     */
    static String folderOf(String resourceName) {
        int slash = resourceName.indexOf('/');
        return slash > 0 ? resourceName.substring(0, slash) : null;
    }

    /** How many shared contexts are open, for tests. */
    static int sharedCount() {
        synchronized (SHARED) {
            return SHARED.size();
        }
    }

    Context context() {
        return context;
    }

    BundledModuleFileSystem fileSystem() {
        return fileSystem;
    }
}
