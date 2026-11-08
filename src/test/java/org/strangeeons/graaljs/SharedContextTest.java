package org.strangeeons.graaljs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.strangeeons.scripts.ScriptException;

class SharedContextTest {

    public interface Counter {
        int count();
    }

    @TempDir
    Path dir;

    private final List<GraalJSSession> sessions = new ArrayList<>();

    private GraalJSSession open() {
        GraalJSSession session = new GraalJSSession(SharedEngine.get(), getClass().getClassLoader(), name -> {
            try {
                return dir.resolve(name).toUri().toURL();
            } catch (MalformedURLException e) {
                throw new AssertionError(e);
            }
        });
        sessions.add(session);
        return session;
    }

    @AfterEach
    void closeAll() {
        sessions.forEach(GraalJSSession::close);
        assertEquals(0, ModuleContext.sharedCount());
    }

    private void write(String name, String source) throws IOException {
        Path file = dir.resolve(name);
        Files.createDirectories(file.getParent());
        Files.writeString(file, source);
    }

    private static final String COUNTER = """
            let made = 0;
            export class Counter { count() { return ++made; } }""";

    @Test
    void sessionsOfOneFolderShareModuleState() throws Exception {
        write("p/counter.mjs", COUNTER);
        write("q/counter.mjs", COUNTER);
        Counter a = open().createHandler("p/counter.mjs:Counter", Counter.class);
        Counter b = open().createHandler("res://p/counter.mjs:Counter", Counter.class);
        Counter other = open().createHandler("q/counter.mjs:Counter", Counter.class);

        assertEquals(1, a.count());
        assertEquals(2, b.count());
        assertEquals(1, other.count());
        assertEquals(2, ModuleContext.sharedCount());
    }

    @Test
    void handlersSeeStateTheEntryModuleSet() throws Exception {
        write("p/shared.mjs", "export const state = { name: null };");
        write("p/entry.mjs", """
                import { state } from './shared.mjs';
                export function initialize() { state.name = PluginContext; }""");
        write("p/card.mjs", """
                import { state } from './shared.mjs';
                export class Card { name() { return state.name; } }""");
        GraalJSSession plugin = open();
        plugin.bind("PluginContext", "the plug-in");
        plugin.eval("", "res://p/entry.mjs");
        plugin.call("initialize");

        assertEquals("the plug-in", open().createHandler("p/card.mjs:Card", Named.class).name());
    }

    public interface Named {
        String name();
    }

    @Test
    void closingASessionKeepsTheContextForOthers() throws Exception {
        write("p/counter.mjs", COUNTER);
        GraalJSSession first = open();
        Counter a = first.createHandler("p/counter.mjs:Counter", Counter.class);
        Counter b = open().createHandler("p/counter.mjs:Counter", Counter.class);
        assertEquals(1, a.count());

        first.close();
        assertEquals(0, a.count());
        assertEquals(2, b.count());
        assertEquals(1, ModuleContext.sharedCount());
        assertThrows(ScriptException.class, () -> first.createHandler("p/counter.mjs:Counter", Counter.class));
    }

    @Test
    void contextClosesWithItsLastSession() throws Exception {
        write("p/counter.mjs", COUNTER);
        GraalJSSession first = open();
        Counter a = first.createHandler("p/counter.mjs:Counter", Counter.class);
        assertEquals(1, a.count());
        first.close();
        first.close();
        assertEquals(0, ModuleContext.sharedCount());

        Counter fresh = open().createHandler("p/counter.mjs:Counter", Counter.class);
        assertEquals(1, fresh.count());
    }

    @Test
    void otherSourcesGetPrivateContexts() throws Exception {
        GraalJSSession a = open();
        GraalJSSession b = open();
        a.bind("x", 1);
        a.eval("globalThis.y = x + 1", "a.js");
        assertEquals(2, a.eval("y", "a.js"));
        assertEquals("undefined", b.eval("typeof y", "b.js"));
        assertEquals(0, ModuleContext.sharedCount());
    }

    @Test
    void sessionClosedBeforeUseReleasesNothing() {
        GraalJSSession unused = open();
        unused.bind("x", 1);
        unused.close();
        assertThrows(IllegalStateException.class, () -> unused.bind("x", 2));
        assertThrows(ScriptException.class, () -> unused.call("f"));
    }

    @Test
    void bindingsAfterTheContextIsChosenApplyToIt() throws Exception {
        GraalJSSession s = open();
        assertNull(s.callIfDefined("missing"));
        s.bind("late", 5);
        assertEquals(5, s.eval("late", "t.js"));
    }

    @Test
    void folderNamesTheSharedContext() {
        assertEquals("p", ModuleContext.folderOf("p/a/b.mjs"));
        assertNull(ModuleContext.folderOf("b.mjs"));
        assertNull(ModuleContext.folderOf("/b.mjs"));
    }
}
