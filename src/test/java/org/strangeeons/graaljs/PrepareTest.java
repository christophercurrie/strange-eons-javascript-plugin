package org.strangeeons.graaljs;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;
import org.strangeeons.scripts.ScriptSession;

class PrepareTest {

    @Test
    void preparesOnceAndToleratesAMissingApplication() throws Exception {
        // without the application the library import fails; prepare logs it
        int before = GraalJSLanguage.prepareCalls();
        assertDoesNotThrow(() -> new GraalJSLanguage().prepare());
        assertDoesNotThrow(() -> new GraalJSLanguage().prepare());
        assertEquals(before + 2, GraalJSLanguage.prepareCalls());
        try (ScriptSession s = new GraalJSLanguage().createSession()) {
            assertEquals(2, s.eval("1 + 1", "t.js"));
        }
    }
}
