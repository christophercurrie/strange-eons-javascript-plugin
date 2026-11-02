// Scripted game components, adapted from Strange Eons' diy.js.
import { facade } from "../internal/host.mjs";
import { Eons, useSettings } from "./common.mjs";

export const DIY = facade("ca.cgjennings.apps.arkham.diy.DIY", {
    methods: [
        "createTestInstance", "filterComponentText", "idealScaleForImage", "imagePathToImage"
    ],
    constructible: true
});
export const DIYSheet = facade("ca.cgjennings.apps.arkham.diy.DIYSheet", {
    constants: [
        "ALIGN_CENTER", "ALIGN_LEADING", "ALIGN_LEFT", "ALIGN_RIGHT", "ALIGN_TRAILING",
        "DEBUG_BLEED_MARGIN", "DEBUG_PORTRAIT_REGION", "DEBUG_UNSAFE_AREA",
        "DEFAULT_HIGH_RESOLUTION_PPI", "ON_PAINT_EVENT_METHOD", "ROTATE_LEFT", "ROTATE_NONE",
        "ROTATE_RIGHT", "ROTATE_UPSIDE_DOWN"
    ],
    methods: [
        "doStandardRendererInitialization", "drawPortraitBox", "getExpansionSymbol",
        "parseExpansionList", "setNamesForRenderer"
    ],
    constructible: true
});
export const FaceStyle = facade("ca.cgjennings.apps.arkham.diy.DIY$FaceStyle", {
    constants: [
        "CARD_AND_MARKER", "EIGHT_FACES", "FOUR_FACES", "ONE_FACE", "PLAIN_BACK",
        "SHARED_FACE", "SIX_FACES", "TWO_FACES"
    ],
    methods: [
        "valueOf", "values"
    ]
});
export const DeckSnappingHint = facade("ca.cgjennings.apps.arkham.sheet.Sheet$DeckSnappingHint", {
    constants: [
        "CARD", "INLAY", "OTHER", "OVERLAY", "TILE"
    ],
    methods: [
        "valueOf", "values"
    ]
});
export const HighResolutionMode = facade("ca.cgjennings.apps.arkham.diy.DIY$HighResolutionMode", {
    constants: [
        "DISABLE", "ENABLE", "FORCE"
    ],
    methods: [
        "valueOf", "values"
    ]
});

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
