package org.strangeeons.graaljs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.ServiceLoader;
import java.util.jar.JarFile;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.strangeeons.scripts.ScriptLanguage;
import org.strangeeons.scripts.ScriptSession;

/**
 * Loads the packaged {@code .selibrary} the way Strange Eons does: a
 * {@link URLClassLoader} over the bundle, parented to a loader that has the
 * script API but no GraalJS. This test's own classpath has no GraalJS, so
 * every polyglot class must come out of the shaded bundle.
 */
class BundleSmokeTest {

    private static URLClassLoader bundleLoader;
    private static ScriptLanguage language;

    @BeforeAll
    static void loadBundle() throws Exception {
        String path = System.getProperty("graaljs.bundle");
        assertNotNull(path, "graaljs.bundle system property not set; run via ./gradlew bundleTest");
        File bundle = new File(path);
        assertTrue(bundle.isFile(), "bundle not built: " + bundle);

        assertThrows(ClassNotFoundException.class,
                () -> Class.forName("org.graalvm.polyglot.Context", false, BundleSmokeTest.class.getClassLoader()),
                "test classpath must not contain GraalJS");

        bundleLoader = new URLClassLoader(new URL[]{bundle.toURI().toURL()},
                ScriptLanguage.class.getClassLoader());
        for (ScriptLanguage l : ServiceLoader.load(ScriptLanguage.class, bundleLoader)) {
            if ("javascript".equals(l.id())) {
                language = l;
            }
        }
        assertNotNull(language, "bundle does not register a javascript ScriptLanguage");
    }

    @AfterAll
    static void closeLoader() throws Exception {
        if (bundleLoader != null) {
            bundleLoader.close();
        }
    }

    @Test
    void manifestIsAtBundleRoot() throws Exception {
        try (JarFile jar = new JarFile(System.getProperty("graaljs.bundle"))) {
            assertNotNull(jar.getEntry("eons-plugin"));
            String id = new String(jar.getInputStream(jar.getEntry("eons-plugin")).readAllBytes());
            assertTrue(id.matches("(?s)#CATALOGUEID\\{[-0-9a-f]+:\\d+(-\\d+){6}}.*"), id);
        }
    }

    @Test
    void languageClassComesFromBundle() {
        assertEquals(bundleLoader, language.getClass().getClassLoader());
    }

    @Test
    void classicScriptRunsFromBundle() throws Exception {
        try (ScriptSession s = language.createSession()) {
            s.eval("function getName() { return [1, 2, 3].map(x => x * 2).join(','); }", "plugin.js");
            assertEquals("2,4,6", s.call("getName"));
        }
    }

    @Test
    void moduleRunsFromBundle() throws Exception {
        try (ScriptSession s = language.createSession()) {
            s.eval("export function initialize() { return Object.hasOwn({ a: 1 }, 'a'); }", "plugin.mjs");
            assertEquals(Boolean.TRUE, s.call("initialize"));
        }
    }

    @Test
    void hostLookupSeesParentClasses() throws Exception {
        // In SE the parent chain holds the application; here it holds the
        // script API. Either way Java.type must resolve through it.
        try (ScriptSession s = language.createSession()) {
            Object r = s.eval("Java.type('org.strangeeons.scripts.ScriptException').class.getName()", "host.js");
            assertEquals("org.strangeeons.scripts.ScriptException", r);
        }
    }

    @Test
    void intlIsAvailable() throws Exception {
        // ICU4J is the largest dependency; confirm it survived shading.
        try (ScriptSession s = language.createSession()) {
            Object r = s.eval("new Intl.NumberFormat('en-US').format(1234.5)", "intl.js");
            assertEquals("1,234.5", r);
        }
    }
}
