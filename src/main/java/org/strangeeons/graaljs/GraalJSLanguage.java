package org.strangeeons.graaljs;

import java.util.Set;
import org.strangeeons.scripts.ScriptLanguage;
import org.strangeeons.scripts.ScriptSession;

/**
 * Registers GraalJS as a scripting language for Strange Eons plug-ins.
 * Discovered via {@link java.util.ServiceLoader} when SE's plug-in loader
 * resolves a manifest with {@code script-language = javascript}.
 *
 * <p><b>Host dependency:</b> Strange Eons currently routes
 * {@code javascript} (case-insensitively) and an absent
 * {@code script-language} straight to the built-in Strange Rhino engine
 * without consulting the {@code ScriptLanguage} registry, so this
 * implementation is never selected until SE changes that dispatch.
 *
 * <p>The host may instantiate this class more than once (it re-runs
 * {@code ServiceLoader} per lookup), so it holds no state; sessions share a
 * process-wide {@link SharedEngine}.
 */
public final class GraalJSLanguage implements ScriptLanguage {

    /** The {@code script-language} manifest value that selects this runtime. */
    public static final String ID = "javascript";

    @Override
    public String id() {
        return ID;
    }

    @Override
    public String displayName() {
        return "JavaScript";
    }

    /**
     * Returns {@code .mjs} only. {@code .js} is not claimed because SE's
     * editor and file routing already associate it with Strange Rhino; a
     * bundle opts into GraalJS through its manifest, not its file names.
     */
    @Override
    public Set<String> fileExtensions() {
        return Set.of(".mjs");
    }

    @Override
    public ScriptSession createSession() {
        return new GraalJSSession(SharedEngine.get(), GraalJSLanguage.class.getClassLoader());
    }

    // wrapBundleClassLoader: default (identity). JavaScript source is never
    // resolved as Java classes, so there is nothing to compile on demand.
}
