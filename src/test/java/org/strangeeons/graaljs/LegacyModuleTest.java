package org.strangeeons.graaljs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Source;
import org.junit.jupiter.api.Test;
import org.strangeeons.scripts.ScriptException;
import org.strangeeons.scripts.ScriptSession;

class LegacyModuleTest {

    private static final List<String> REEXPORTED = List.of(
            "common", "cards", "diy", "extension", "fontutils", "imageutils", "libutils", "markup",
            "modifiers", "project", "random", "threads", "tints", "uibindings", "uicontrols", "uilayout");
    private static final List<String> STANDALONE = List.of("prefab", "backwards-compatibility");
    private static final Pattern RHINO_ONLY = Pattern.compile(
            "\\bPackages\\.|\\bimportClass\\(|\\bimportPackage\\(|__defineGetter__|\\buseLibrary\\b|\\bsourcefile\\b");
    private static final Pattern EXPORT = Pattern.compile("^export (?:const|function) (\\$?\\w+)", Pattern.MULTILINE);

    private static String read(String resource) throws IOException {
        try (InputStream in = LegacyModuleTest.class.getClassLoader().getResourceAsStream(resource)) {
            assertNotNull(in, resource);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static List<String> allModules() {
        List<String> modules = new ArrayList<>(List.of("strange-eons/legacy.mjs"));
        REEXPORTED.forEach(name -> modules.add("strange-eons/legacy/" + name + ".mjs"));
        STANDALONE.forEach(name -> modules.add("strange-eons/legacy/" + name + ".mjs"));
        return modules;
    }

    @Test
    void everyModuleParses() throws IOException {
        try (Context context = Context.newBuilder("js").allowAllAccess(true).build()) {
            for (String module : allModules()) {
                Source source = Source.newBuilder("js", read(module), module)
                        .mimeType("application/javascript+module").build();
                context.parse(source);
            }
        }
    }

    @Test
    void modulesAvoidRhinoOnlyFeatures() throws IOException {
        for (String module : allModules()) {
            Matcher matcher = RHINO_ONLY.matcher(read(module));
            assertFalse(matcher.find(), () -> module + " uses " + matcher.group());
        }
    }

    @Test
    void entryModuleReexportsEveryLibrary() throws IOException {
        String entry = read("strange-eons/legacy.mjs");
        REEXPORTED.forEach(name -> assertTrue(entry.contains("./legacy/" + name + ".mjs"), name));
        STANDALONE.forEach(name -> assertFalse(entry.contains("./legacy/" + name + ".mjs"), name));
    }

    // export * silently drops a name that two modules both export.
    @Test
    void reexportedNamesAreUnique() throws IOException {
        Map<String, String> owners = new HashMap<>();
        for (String name : REEXPORTED) {
            Matcher matcher = EXPORT.matcher(read("strange-eons/legacy/" + name + ".mjs"));
            while (matcher.find()) {
                String previous = owners.putIfAbsent(matcher.group(1), name);
                assertEquals(null, previous, matcher.group(1));
            }
        }
    }

    @Test
    void importResolvesInsideTheBundleUntilItNeedsTheApplication() {
        try (ScriptSession s = new GraalJSLanguage().createSession()) {
            ScriptException e = assertThrows(ScriptException.class,
                    () -> s.eval("import 'strange-eons/legacy';", "test.mjs"));
            assertTrue(e.getMessage().contains("ca.cgjennings.apps.arkham"), e.getMessage());
        }
    }
}
