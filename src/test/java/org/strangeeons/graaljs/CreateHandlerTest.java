package org.strangeeons.graaljs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.strangeeons.scripts.ScriptException;

class CreateHandlerTest {

    public interface Card {
        int count();

        String name(String prefix);

        void touch(StringBuilder out);

        default String label() {
            return "default";
        }
    }

    @TempDir
    Path dir;

    private GraalJSSession session;

    @BeforeEach
    void open() {
        session = new GraalJSSession(SharedEngine.get(), getClass().getClassLoader(), name -> {
            try {
                return dir.resolve(name).toUri().toURL();
            } catch (MalformedURLException e) {
                throw new AssertionError(e);
            }
        });
    }

    @AfterEach
    void close() {
        session.close();
    }

    private void write(String name, String source) throws IOException {
        Path file = dir.resolve(name);
        Files.createDirectories(file.getParent());
        Files.writeString(file, source);
    }

    @Test
    void constructsExportedClass() throws Exception {
        write("cards/card.mjs", """
                export class Card {
                    constructor() { this.total = 3; }
                    count() { return this.total; }
                    name(prefix) { return prefix + 'card'; }
                    touch(out) { out.append('touched'); }
                    label() { return 'own'; }
                }""");
        Card card = session.createHandler("cards/card.mjs:Card", Card.class);

        assertEquals(3, card.count());
        assertEquals("a card", card.name("a "));
        StringBuilder out = new StringBuilder();
        card.touch(out);
        assertEquals("touched", out.toString());
        assertEquals("own", card.label());
    }

    @Test
    void acceptsResUrlAndInstancesAreSeparate() throws Exception {
        write("a/card.mjs", """
                let made = 0;
                export class Card { count() { return ++made; } }""");
        Card first = session.createHandler("res://a/card.mjs:Card", Card.class);
        Card second = session.createHandler("a/card.mjs:Card", Card.class);

        assertEquals(1, first.count());
        assertEquals(2, second.count());
        assertNotEquals(first, second);
        assertEquals(first, first);
        assertEquals(System.identityHashCode(first), first.hashCode());
        assertTrue(first.toString().contains("Card"));
    }

    @Test
    void undefinedMethodsDoNothing() throws Exception {
        write("empty.mjs", "export class Empty {}");
        Card card = session.createHandler("empty.mjs:Empty", Card.class);

        assertEquals(0, card.count());
        assertNull(card.name("x"));
        card.touch(new StringBuilder());
        assertEquals("default", card.label());
    }

    @Test
    void undefinedResultIsEmpty() throws Exception {
        write("blank.mjs", "export class Blank { count() {} name() {} }");
        Card card = session.createHandler("blank.mjs:Blank", Card.class);

        assertEquals(0, card.count());
        assertNull(card.name("x"));
    }

    @Test
    void resolvesRelativeAndLibraryImports() throws Exception {
        write("a/util.mjs", "export const three = 3;");
        write("a/b/card.mjs", """
                import { three } from '../util.mjs';
                import { answer } from 'strange-eons/fixture';
                export class Card { count() { return three + answer; } }""");

        assertEquals(45, session.createHandler("a/b/card.mjs:Card", Card.class).count());
    }

    @Test
    void resourceEntryModuleResolvesRelativeImports() throws Exception {
        write("p/lib/info.mjs", "export const name = 'Plug-in';");
        write("p/entry.mjs", """
                import { name } from './lib/info.mjs';
                export function getName() { return name; }""");

        session.eval("ignored: the module is read from its resource", "res://p/entry.mjs");
        assertEquals("Plug-in", session.call("getName"));
        assertNull(session.callIfDefined("initialize"));
    }

    @Test
    void reportsMissingModuleAsFileNotFound() {
        ScriptException e = assertThrows(ScriptException.class,
                () -> session.createHandler("missing.mjs:Card", Card.class));
        assertInstanceOf(FileNotFoundException.class, e.getCause());
    }

    @Test
    void rejectsBadSpecs() throws Exception {
        write("plain.mjs", "export const notClass = 1;");
        for (String spec : List.of("plain.mjs:Missing", "plain.mjs:notClass", "plain.mjs",
                "project:plain.mjs:Card", "../outside.mjs:Card")) {
            assertThrows(ScriptException.class, () -> session.createHandler(spec, Card.class), spec);
        }
        assertThrows(ScriptException.class, () -> session.createHandler("plain.mjs:Card", String.class));
    }

    @Test
    void reportsModuleAndConstructorErrors() throws Exception {
        write("syntax.mjs", "export class {");
        write("throws.mjs", "export class Card { constructor() { throw new Error('no'); } }");

        assertThrows(ScriptException.class, () -> session.createHandler("syntax.mjs:Card", Card.class));
        ScriptException e = assertThrows(ScriptException.class,
                () -> session.createHandler("throws.mjs:Card", Card.class));
        assertTrue(e.getMessage().contains("no"));
    }

    @Test
    void methodErrorsReachTheCaller() throws Exception {
        write("fail.mjs", """
                export class Card {
                    count() { throw new Error('bad count'); }
                    name(prefix) { return prefix.missing(); }
                    touch(out) { out.charAt(99); }
                }""");
        Card card = session.createHandler("fail.mjs:Card", Card.class);

        assertTrue(assertThrows(IllegalStateException.class, card::count).getMessage().contains("bad count"));
        assertThrows(IllegalStateException.class, () -> card.name("x"));
        assertThrows(StringIndexOutOfBoundsException.class, () -> card.touch(new StringBuilder()));
    }

    @Test
    void callsFromManyThreadsSerialize() throws Exception {
        write("busy.mjs", """
                export class Card {
                    count() { let n = 0; for (let i = 0; i < 20000; ++i) { n += i % 2; } return n; }
                }""");
        Card card = session.createHandler("busy.mjs:Card", Card.class);
        ExecutorService pool = Executors.newFixedThreadPool(4);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 40; ++i) {
                results.add(pool.submit(card::count));
            }
            for (Future<Integer> result : results) {
                assertEquals(10000, result.get());
            }
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void handlerDoesNothingAfterClose() throws Exception {
        write("live.mjs", "export class Card { count() { return 3; } name() { return 'x'; } }");
        Card card = session.createHandler("live.mjs:Card", Card.class);
        session.close();

        assertEquals(0, card.count());
        assertNull(card.name("x"));
        assertThrows(ScriptException.class, () -> session.createHandler("live.mjs:Card", Card.class));
    }

    @Test
    void resourceExistenceFollowsTheResolver() throws Exception {
        BundledModuleFileSystem none = new BundledModuleFileSystem(getClass().getClassLoader());
        Path path = BundledModuleFileSystem.resourcePath("a.mjs");
        assertFalse(none.hasResource(path));

        URL unreadable = dir.resolve("gone.mjs").toUri().toURL();
        assertFalse(new BundledModuleFileSystem(getClass().getClassLoader(), n -> unreadable).hasResource(path));
    }
}
