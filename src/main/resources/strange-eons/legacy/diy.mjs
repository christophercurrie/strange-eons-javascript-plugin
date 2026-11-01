// Scripted game components, adapted from Strange Eons' diy.js.
import { Eons, useSettings } from "./common.mjs";

export const DIY = Java.type("ca.cgjennings.apps.arkham.diy.DIY");
export const DIYSheet = Java.type("ca.cgjennings.apps.arkham.diy.DIYSheet");
export const FaceStyle = Java.type("ca.cgjennings.apps.arkham.diy.DIY$FaceStyle");
export const DeckSnappingHint = Java.type("ca.cgjennings.apps.arkham.sheet.Sheet$DeckSnappingHint");
export const HighResolutionMode = Java.type("ca.cgjennings.apps.arkham.diy.DIY$HighResolutionMode");

/**
 * Opens a test editor for a component. {@code handlers} holds the functions a
 * DIY script defines ({@code create}, {@code paintFront}, and so on).
 */
export function testDIYScript(gameCode, handlers) {
    let diy;
    const withSettings = (name) => (component, ...args) => {
        useSettings(component);
        return handlers[name](component, ...args);
    };
    const painter = (name) => (g, component, sheet) => {
        useSettings(component);
        handlers[name](g, component, sheet);
    };
    const handler = {
        create: withSettings("create"),
        createInterface: withSettings("createInterface"),
        createFrontPainter: withSettings("createFrontPainter"),
        createBackPainter: withSettings("createBackPainter"),
        paintFront: painter("paintFront"),
        paintBack: painter("paintBack"),
        onClear: withSettings("onClear"),
        onRead: withSettings("onRead"),
        onWrite: withSettings("onWrite"),
        getPortraitCount() {
            useSettings(diy);
            return handlers.getPortraitCount();
        },
        getPortrait(index) {
            useSettings(diy);
            return handlers.getPortrait(index);
        }
    };
    diy = DIY.createTestInstance(handler, gameCode);
    const editor = diy.createDefaultEditor();
    editor.setTestModeEnabled(true);
    Eons.addEditor(editor);
}
