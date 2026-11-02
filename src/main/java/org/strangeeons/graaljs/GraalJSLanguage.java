package org.strangeeons.graaljs;

import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.util.Set;
import org.strangeeons.scripts.ScriptLanguage;
import org.strangeeons.scripts.ScriptSession;

/**
 * Registers GraalJS as a scripting language for Strange Eons plug-ins.
 * Discovered via {@link java.util.ServiceLoader} when SE's plug-in loader
 * resolves a manifest with {@code script-language = ecmascript}.
 *
 * <p>The id is not {@code javascript} because Strange Eons reserves that
 * value, along with an absent {@code script-language}, for the built-in
 * Strange Rhino engine.
 *
 * <p>The host may instantiate this class more than once (it re-runs
 * {@code ServiceLoader} per lookup), so it holds no state; sessions share a
 * process-wide {@link SharedEngine}.
 */
public final class GraalJSLanguage implements ScriptLanguage {

    /** The {@code script-language} manifest value that selects this runtime. */
    public static final String ID = "ecmascript";

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
        return new GraalJSSession(SharedEngine.get(), GraalJSLanguage.class.getClassLoader(),
                GraalJSLanguage::resourceUrl);
    }

    /** Resolves through Strange Eons's {@code res:} protocol, which searches every plug-in. */
    private static URL resourceUrl(String name) {
        try {
            return URI.create("res://" + name).toURL();
        } catch (MalformedURLException | IllegalArgumentException e) {
            return null;
        }
    }

    // wrapBundleClassLoader: default (identity). JavaScript source is never
    // resolved as Java classes, so there is nothing to compile on demand.
}
