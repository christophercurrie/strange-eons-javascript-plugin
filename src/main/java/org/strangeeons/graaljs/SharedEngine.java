package org.strangeeons.graaljs;

import java.lang.System.Logger.Level;
import org.graalvm.polyglot.Engine;

/**
 * Process-wide polyglot {@link Engine}. Contexts created against one engine
 * share parsed code and (on an optimizing runtime) compiled code, so a deck
 * of components running the same plug-in script parses it once.
 *
 * <p>The engine lives for the life of the JVM. SE v1 plug-in unload is
 * restart-based, so there is no point at which closing it would be safe and
 * useful.
 */
final class SharedEngine {

    private static final System.Logger LOG = System.getLogger(SharedEngine.class.getName());

    private SharedEngine() {
    }

    static Engine get() {
        return Holder.ENGINE;
    }

    private static final class Holder {
        static final Engine ENGINE = create();

        private static Engine create() {
            // Options can still be set from outside with -Dpolyglot.<option>
            // (useSystemProperties defaults to true), e.g.
            // -Dpolyglot.engine.WarnInterpreterOnly=false.
            Engine engine = Engine.newBuilder("js").build();
            // "Interpreted" means the fallback Truffle runtime: no JIT for
            // guest code. Logged once so performance reports can be triaged.
            LOG.log(Level.INFO, "GraalJS {0} on {1} runtime",
                    engine.getVersion(), engine.getImplementationName());
            return engine;
        }
    }
}
