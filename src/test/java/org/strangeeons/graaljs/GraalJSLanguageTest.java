package org.strangeeons.graaljs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.ServiceLoader;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.strangeeons.scripts.ScriptException;
import org.strangeeons.scripts.ScriptLanguage;
import org.strangeeons.scripts.ScriptSession;

class GraalJSLanguageTest {

    private static ScriptSession session() {
        return new GraalJSLanguage().createSession();
    }

    @Test
    void serviceLoaderPicksUpRegistration() {
        ScriptLanguage found = null;
        for (ScriptLanguage lang : ServiceLoader.load(ScriptLanguage.class)) {
            if (GraalJSLanguage.ID.equals(lang.id())) {
                found = lang;
            }
        }
        assertNotNull(found, "GraalJSLanguage must be registered via META-INF/services");
        assertFalse(found.fileExtensions().contains(".js"), ".js belongs to Strange Rhino");
    }

    @Test
    void idFollowsSpiConvention() {
        // ScriptLanguage.id() must be lower-case ASCII; "JavaScript" is the display name.
        GraalJSLanguage lang = new GraalJSLanguage();
        assertEquals("javascript", lang.id());
        assertEquals("JavaScript", lang.displayName());
    }

    // --- modern syntax --------------------------------------------------

    @Test
    void evaluatesModernSyntax() throws Exception {
        try (ScriptSession s = session()) {
            Object r = s.eval("""
                    class Card { #cost; constructor(c) { this.#cost = c; } get cost() { return this.#cost; } }
                    const cards = [new Card(2), new Card(3)];
                    const total = cards.map(({ cost }) => cost).reduce((a, b) => a + b, 0);
                    const maybe = null;
                    `${total}:${maybe?.x ?? 'none'}:${[1, [2, [3]]].flat(Infinity).at(-1)}`
                    """, "modern.js");
            assertEquals("5:none:3", r);
        }
    }

    @Test
    void numbersMapToNarrowestBox() throws Exception {
        try (ScriptSession s = session()) {
            assertEquals(42, s.eval("21 * 2", "n.js"));
            assertEquals(1L << 40, s.eval("2 ** 40", "n.js"));
            assertEquals(0.5, s.eval("1 / 2", "n.js"));
        }
    }

    // --- classic scripts --------------------------------------------------

    @Test
    void callInvokesGlobalFunction() throws Exception {
        try (ScriptSession s = session()) {
            s.eval("function add(a, b) { return a + b; }", "add.js");
            assertEquals(7, s.call("add", 3, 4));
        }
    }

    @Test
    void constArrowFunctionIsCallable() throws Exception {
        // Lexical (let/const) globals live in the global scope, not on
        // globalThis; the bindings object must still expose them.
        try (ScriptSession s = session()) {
            s.eval("const getName = () => 'Arrow';", "arrow.js");
            assertEquals("Arrow", s.callIfDefined("getName"));
        }
    }

    @Test
    void callOnUndefinedFunctionThrows() throws Exception {
        try (ScriptSession s = session()) {
            s.eval("function foo() { return 'foo'; }", "foo.js");
            assertThrows(ScriptException.class, () -> s.call("missing"));
        }
    }

    @Test
    void callIfDefinedReturnsNullForMissingOrNonFunction() throws Exception {
        try (ScriptSession s = session()) {
            s.eval("function foo() { return 'foo'; } var notAFunction = 3;", "foo.js");
            assertNull(s.callIfDefined("missing"));
            assertNull(s.callIfDefined("notAFunction"));
            assertEquals("foo", s.callIfDefined("foo"));
        }
    }

    @Test
    void callIfDefinedBeforeEvalReturnsNull() throws Exception {
        try (ScriptSession s = session()) {
            assertNull(s.callIfDefined("initialize"));
        }
    }

    // --- modules ----------------------------------------------------------

    @Test
    void moduleExportsAreCallable() throws Exception {
        try (ScriptSession s = session()) {
            s.eval("""
                    export function getName() { return 'Module'; }
                    export const getVersion = () => 1.5;
                    function privateHelper() { return 'hidden'; }
                    """, "plugin.mjs");
            assertEquals("Module", s.call("getName"));
            assertEquals(1.5, s.call("getVersion"));
            assertNull(s.callIfDefined("privateHelper"), "non-exported module functions are private");
        }
    }

    @Test
    void moduleSeesBoundGlobals() throws Exception {
        try (ScriptSession s = session()) {
            s.bind("PluginContext", "ctx");
            s.eval("export function initialize() { return PluginContext === 'ctx'; }", "plugin.mjs");
            assertEquals(Boolean.TRUE, s.call("initialize"));
        }
    }

    // --- host interop -----------------------------------------------------

    @Test
    void boundHostObjectsAreUsableAndReturnedUnwrapped() throws Exception {
        try (ScriptSession s = session()) {
            List<String> list = new ArrayList<>();
            s.bind("list", list);
            Object r = s.eval("list.add('a'); list.add('b'); list", "host.js");
            assertSame(list, r);
            assertEquals(List.of("a", "b"), list);
        }
    }

    @Test
    void javaTypeLooksUpHostClasses() throws Exception {
        try (ScriptSession s = session()) {
            Object r = s.eval("""
                    const StringBuilder = Java.type('java.lang.StringBuilder');
                    new StringBuilder('ab').reverse().toString()
                    """, "type.js");
            assertEquals("ba", r);
        }
    }

    @Test
    void hostExceptionBecomesCause() throws Exception {
        try (ScriptSession s = session()) {
            s.eval("function boom() { Java.type('java.lang.Integer').parseInt('x'); }", "boom.js");
            ScriptException e = assertThrows(ScriptException.class, () -> s.call("boom"));
            assertInstanceOf(NumberFormatException.class, e.getCause());
        }
    }

    // --- errors -----------------------------------------------------------

    @Test
    void syntaxErrorIsReportedWithLocation() {
        try (ScriptSession s = session()) {
            ScriptException e = assertThrows(ScriptException.class,
                    () -> s.eval("\n\nfunction broken( {", "broken.js"));
            assertTrue(e.getMessage().startsWith("syntax error at broken.js:3"), e.getMessage());
        }
    }

    @Test
    void thrownErrorIsReportedWithLocation() throws Exception {
        try (ScriptSession s = session()) {
            s.eval("function fail() {\n  throw new TypeError('nope');\n}", "fail.js");
            ScriptException e = assertThrows(ScriptException.class, () -> s.call("fail"));
            assertTrue(e.getMessage().contains("fail.js:2"), e.getMessage());
            assertTrue(e.getMessage().contains("nope"), e.getMessage());
        }
    }

    // --- lifecycle --------------------------------------------------------

    @Test
    void sessionsAreIsolated() throws Exception {
        try (ScriptSession a = session(); ScriptSession b = session()) {
            a.eval("var shared = 1;", "a.js");
            assertEquals("undefined", b.eval("typeof shared", "b.js"));
        }
    }

    @Test
    void closeIsIdempotentAndRejectsLaterUse() throws Exception {
        ScriptSession s = session();
        s.eval("var x = 1", "x.js");
        s.close();
        s.close();
        assertThrows(ScriptException.class, () -> s.eval("x", "x.js"));
        assertThrows(IllegalStateException.class, () -> s.bind("y", 1));
    }

    @Test
    void closeCancelsRunningScript() throws Exception {
        ScriptSession s = session();
        CountDownLatch started = new CountDownLatch(1);
        s.bind("started", (Runnable) started::countDown);
        Thread t = new Thread(() -> {
            try {
                s.eval("started.run(); for (;;) {}", "spin.js");
            } catch (ScriptException expected) {
                // cancellation surfaces as a ScriptException
            }
        });
        t.start();
        assertTrue(started.await(10, TimeUnit.SECONDS));
        s.close();
        t.join(TimeUnit.SECONDS.toMillis(10));
        assertFalse(t.isAlive(), "close() must cancel a running script");
    }

    @Test
    void concurrentCallsSerialize() throws Exception {
        try (ScriptSession s = session()) {
            s.eval("let n = 0; function inc() { for (let i = 0; i < 1000; i++) n++; return n; }", "inc.js");
            Thread[] threads = new Thread[4];
            for (int i = 0; i < threads.length; i++) {
                threads[i] = new Thread(() -> {
                    for (int j = 0; j < 25; j++) {
                        try {
                            s.call("inc");
                        } catch (ScriptException e) {
                            throw new AssertionError(e);
                        }
                    }
                });
                threads[i].start();
            }
            for (Thread t : threads) {
                t.join();
            }
            assertEquals(100_000, s.eval("n", "n.js"));
        }
    }
}
