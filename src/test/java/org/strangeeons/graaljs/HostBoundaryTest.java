package org.strangeeons.graaljs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.strangeeons.scripts.ScriptException;
import org.strangeeons.scripts.ScriptSession;

class HostBoundaryTest {

    private static final String FIXTURE = "import { hiddenClassName, Hidden, Inherited, InterfaceConstant, Sealed } from 'strange-eons/privileged-fixture';";

    private static Object eval(String source, String name) throws ScriptException {
        try (ScriptSession s = new GraalJSLanguage().createSession()) {
            return s.eval(source, name);
        }
    }

    private static Object moduleResult(String body) throws ScriptException {
        try (ScriptSession s = new GraalJSLanguage().createSession()) {
            s.eval(FIXTURE + " export function result() { " + body + " }", "test.mjs");
            return s.call("result");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "org.strangeeons.scripts.ScriptException",
        "org.strangeeons.graaljs.HostClasses",
        "java.lang.Class",
        "java.lang.ClassLoader",
        "java.lang.Runtime",
        "java.lang.System",
        "java.lang.Thread",
        "java.lang.reflect.Method",
        "java.lang.invoke.MethodHandles",
        "java.net.URLClassLoader",
        "java.util.ServiceLoader"
    })
    void javaTypeRejectsClassesOutsideTheAllowlist(String className) {
        ScriptException e = assertThrows(ScriptException.class, () -> eval("Java.type('" + className + "')", "t.js"));
        assertTrue(e.getMessage().contains("not available to plug-in scripts"), e.getMessage());
    }

    @ParameterizedTest
    @ValueSource(strings = {"java.util.ArrayList", "javax.swing.JLabel", "java.lang.String", "java.awt.Color"})
    void javaTypeAllowsSupportedJdkClasses(String className) throws ScriptException {
        assertEquals(true, eval("Java.isType(Java.type('" + className + "'))", "t.js"));
    }

    @Test
    void javaToRejectsClassesOutsideTheAllowlist() {
        assertThrows(ScriptException.class,
                () -> eval("Java.to([], 'org.strangeeons.scripts.ScriptException[]')", "t.js"));
    }

    @Test
    void javaToAllowsPrimitiveAndAllowedArrays() throws ScriptException {
        assertEquals(2, eval("Java.to([1, 2], 'int[]').length", "t.js"));
        assertEquals(1, eval("Java.to(['a'], 'java.lang.String[]').length", "t.js"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"Packages", "java", "javax", "Polyglot"})
    void packageGlobalsAreAbsent(String global) throws ScriptException {
        assertEquals("undefined", eval("typeof " + global, "t.js"));
    }

    @Test
    void javaGlobalCannotBeReplacedOrExtended() {
        assertThrows(ScriptException.class,
                () -> eval("Object.defineProperty(globalThis, 'Java', { value: 1 })", "t.js"));
        assertThrows(ScriptException.class, () -> eval("'use strict'; Java.extend = 1", "t.js"));
    }

    @Test
    void javaGlobalOmitsClassLoadingFunctions() throws ScriptException {
        assertEquals("undefined", eval("typeof Java.extend + ''", "t.js"));
        assertEquals("undefined", eval("typeof Java.addToClasspath + ''", "t.js"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "new (Java.type('java.util.ArrayList'))().getClass()",
        "new (Java.type('java.util.ArrayList'))().getClass().static",
        "new (Java.type('java.util.ArrayList'))().wait()"
    })
    void objectReflectionIsDenied(String source) {
        assertThrows(ScriptException.class, () -> eval(source, "t.js"));
    }

    @Test
    void classObjectsExposeNoReflection() {
        assertThrows(ScriptException.class,
                () -> eval("Java.type('java.util.ArrayList').class.forName('java.lang.System')", "t.js"));
        assertThrows(ScriptException.class,
                () -> eval("Java.type('java.util.ArrayList').class.getClassLoader()", "t.js"));
    }

    @Test
    void ordinaryHostMethodsStillWork() throws ScriptException {
        assertEquals("[1]", eval("""
                const list = new (Java.type('java.util.ArrayList'))();
                list.add(1);
                list.toString()
                """, "t.js"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "strange-eons/internal/host",
        "strange-eons/internal/host.mjs",
        "strange-eons/legacy/../internal/host",
        "/.strange-eons-bundled-modules/strange-eons/internal/host.mjs",
        "file:///.strange-eons-bundled-modules/strange-eons/internal/host.mjs"
    })
    void pluginCodeCannotImportInternalModules(String specifier) {
        assertThrows(ScriptException.class, () -> eval("import '" + specifier + "';", "t.mjs"));
        assertThrows(ScriptException.class, () -> eval("await import('" + specifier + "');", "t.mjs"));
    }

    @Test
    void relativePathToInternalModuleIsRejected() {
        Path cwd = Path.of("").toAbsolutePath();
        Path internal = cwd.getRoot().resolve(".strange-eons-bundled-modules/strange-eons/internal/host.mjs");
        String relative = cwd.relativize(internal).toString().replace('\\', '/');
        assertThrows(ScriptException.class, () -> eval("import '" + relative + "';", "t.mjs"));
    }

    @Test
    void fileSystemRejectsInternalPathsOnlyAfterSealing() {
        BundledModuleFileSystem fs = new BundledModuleFileSystem(getClass().getClassLoader());
        fs.parsePath("strange-eons/internal/host");
        fs.seal();
        assertThrows(InvalidPathException.class, () -> fs.parsePath("strange-eons/internal/host"));
        fs.parsePath("strange-eons/fixture");
    }

    @Test
    void libraryModulesKeepPrivilegedAccess() throws ScriptException {
        assertEquals("hidden", moduleResult("return hiddenClassName();"));
    }

    @Test
    void facadeConstructsAndSupportsInstanceof() throws ScriptException {
        assertEquals(true, moduleResult("return new Hidden('x') instanceof Hidden;"));
    }

    @Test
    void facadeRejectsCallsAndUnlistedConstruction() {
        assertThrows(ScriptException.class, () -> moduleResult("return Hidden('x');"));
        assertThrows(ScriptException.class, () -> moduleResult("return new Sealed();"));
    }

    @Test
    void facadeReachesInheritedStatics() throws ScriptException {
        assertEquals(1, moduleResult("return InterfaceConstant.VERTICAL;"));
        assertEquals(0, moduleResult("return Inherited.newHashMap(4).size();"));
    }

    @Test
    void hostClassesDescribeClassesAndInstances() throws Exception {
        assertEquals("java.util.ArrayList", HostClasses.name(new java.util.ArrayList<String>()));
        assertEquals("java.util.ArrayList", HostClasses.name(java.util.ArrayList.class));
        assertEquals("ArrayList", HostClasses.simpleName(new java.util.ArrayList<String>()));
        String[] hierarchy = HostClasses.hierarchy(new java.util.ArrayList<String>());
        assertEquals("java.util.ArrayList", hierarchy[0]);
        assertEquals("java.lang.Object", hierarchy[hierarchy.length - 1]);
        assertEquals("javax.swing.SwingConstants", HostClasses.declaringClass("javax.swing.JSeparator", "VERTICAL"));
        assertThrows(IllegalArgumentException.class, () -> HostClasses.declaringClass("java.lang.String", "nothing"));
    }

    @Test
    void facadeIsFrozen() {
        assertThrows(ScriptException.class, () -> moduleResult("Hidden.extra = 1; return Hidden.extra;"));
    }
}
