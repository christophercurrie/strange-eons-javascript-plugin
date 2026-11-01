package org.strangeeons.graaljs;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.strangeeons.scripts.ScriptException;
import org.strangeeons.scripts.ScriptSession;

class BundledModuleImportTest {

    private static Object importAnswer(String specifier) throws ScriptException {
        try (ScriptSession s = new GraalJSLanguage().createSession()) {
            s.eval("import { answer } from '" + specifier + "';"
                    + " export function read() { return answer; }", "test.mjs");
            return s.call("read");
        }
    }

    @Test
    void resolvesBareSpecifierAndRelativeImportsFromTheBundle() throws ScriptException {
        assertEquals(42, importAnswer("strange-eons/fixture"));
    }

    @Test
    void acceptsAnExplicitExtension() throws ScriptException {
        assertEquals(42, importAnswer("strange-eons/fixture.mjs"));
    }

    @Test
    void reportsMissingBundledModule() {
        assertThrows(ScriptException.class, () -> importAnswer("strange-eons/missing"));
    }

    @Test
    void rejectsSpecifierThatEscapesTheNamespace() {
        BundledModuleFileSystem fs = new BundledModuleFileSystem(getClass().getClassLoader());
        assertThrows(InvalidPathException.class, () -> fs.parsePath("strange-eons/../../etc/passwd"));
        assertThrows(ScriptException.class, () -> importAnswer("strange-eons/../../etc/passwd"));
    }

    @Test
    void relativeImportOutsideTheNamespaceIsNotServedFromTheBundle() throws IOException {
        BundledModuleFileSystem fs = new BundledModuleFileSystem(getClass().getClassLoader());
        Path outside = fs.parsePath("strange-eons/fixture").resolveSibling("../fixture.mjs");
        assertThrows(NoSuchFileException.class, () -> fs.toRealPath(outside));
    }

    @Test
    void otherSpecifiersStillUseTheFileSystem(@TempDir Path dir) throws IOException, ScriptException {
        Path module = dir.resolve("disk.mjs");
        Files.writeString(module, "export const answer = 7;");
        assertEquals(7, importAnswer(module.toString().replace('\\', '/')));
    }
}
