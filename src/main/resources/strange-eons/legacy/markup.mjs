// Markup boxes and text styles, adapted from Strange Eons' markup.js.
import { Java, facade } from "../internal/host.mjs";
import { ResourceKit } from "./common.mjs";

export const MarkupBox = facade("ca.cgjennings.layout.MarkupRenderer", {
    constants: [
        "DEBUG", "FIT_BOTH", "FIT_NONE", "FIT_SCALE_TEXT", "FIT_TIGHTEN_LINE_SPACING",
        "LAYOUT_BOTTOM", "LAYOUT_CENTER", "LAYOUT_JUSTIFY", "LAYOUT_LEFT", "LAYOUT_MIDDLE",
        "LAYOUT_RIGHT", "LAYOUT_TOP", "USE_FAST_LINE_BREAKER", "USE_PATCHED_LINE_BREAKER"
    ],
    methods: [
        "convertTagsToLinebreaks", "getDefaultExpansionLimit", "getEvaluatorFactory",
        "parseMeasurement", "setDefaultExpansionLimit", "setEvaluatorFactory"
    ],
    constructible: true
});
export const GenderMarkupBox = facade("ca.cgjennings.layout.GenderAwareMarkupRenderer", {
    constants: [
        "DEBUG", "FIT_BOTH", "FIT_NONE", "FIT_SCALE_TEXT", "FIT_TIGHTEN_LINE_SPACING",
        "GENDER_LEFT", "GENDER_MIDDLE", "GENDER_RIGHT", "LAYOUT_BOTTOM", "LAYOUT_CENTER",
        "LAYOUT_JUSTIFY", "LAYOUT_LEFT", "LAYOUT_MIDDLE", "LAYOUT_RIGHT", "LAYOUT_TOP",
        "USE_FAST_LINE_BREAKER", "USE_PATCHED_LINE_BREAKER"
    ],
    methods: [
        "capitalize", "convertTagsToLinebreaks", "getDefaultExpansionLimit",
        "getEvaluatorFactory", "parseMeasurement", "setDefaultExpansionLimit",
        "setEvaluatorFactory"
    ],
    constructible: true
});
export const TextStyle = facade("ca.cgjennings.layout.TextStyle", {
    constants: [
        "BOLD_STYLE", "COLOR_BLACK", "COLOR_BLUE", "COLOR_BROWN", "COLOR_DKGREY",
        "COLOR_GREEN", "COLOR_GREY", "COLOR_LTGREY", "COLOR_ORANGE", "COLOR_PURPLE",
        "COLOR_RED", "COLOR_WHITE", "COLOR_YELLOW", "ITALIC_STYLE", "JUSTIFY", "KERNING_OFF",
        "KERNING_ON", "LIGATURES_OFF", "LIGATURES_ON", "PLAIN_STYLE", "SANSSERIF_STYLE",
        "SERIF_STYLE", "STRIKETHROUGH_STYLE", "SUBSCRIPT_STYLE", "SUPERSCRIPT_STYLE",
        "TYPEWRITER_STYLE", "UNDERLINE_STYLE", "UPRIGHT_STYLE"
    ],
    constructible: true
});
export const TextAttribute = Java.type("java.awt.font.TextAttribute");
export const PageShape = facade("ca.cgjennings.layout.PageShape", {
    constants: [
        "RECTANGLE_SHAPE"
    ],
    constructible: true
});

const Sheet = Java.type("ca.cgjennings.apps.arkham.sheet.Sheet");

export function markupBox(sheet, genderAware) {
    const isSheet = sheet instanceof Sheet;
    const ppi = isSheet ? sheet.getTemplateResolution() : sheet;
    const renderer = genderAware ? new GenderMarkupBox(ppi) : new MarkupBox(ppi);
    if (isSheet) {
        sheet.doStandardRendererInitialization(renderer);
    }
    return renderer;
}

export function updateNameTags(markupbox, gameComponent) {
    Sheet.setNamesForRenderer(markupbox, gameComponent.getName(), null, null);
}

export const FAMILY_BODY = ResourceKit.getBodyFamily();

export const FIT_NONE = MarkupBox.FIT_NONE;
export const FIT_SCALE_TEXT = MarkupBox.FIT_SCALE_TEXT;
export const FIT_TIGHTEN_LINE_SPACING = MarkupBox.FIT_TIGHTEN_LINE_SPACING;
export const FIT_BOTH = MarkupBox.FIT_BOTH;
export const LAYOUT_LEFT = MarkupBox.LAYOUT_LEFT;
export const LAYOUT_CENTER = MarkupBox.LAYOUT_CENTER;
export const LAYOUT_RIGHT = MarkupBox.LAYOUT_RIGHT;
export const LAYOUT_TOP = MarkupBox.LAYOUT_TOP;
export const LAYOUT_MIDDLE = MarkupBox.LAYOUT_MIDDLE;
export const LAYOUT_BOTTOM = MarkupBox.LAYOUT_BOTTOM;
export const LAYOUT_JUSTIFY = MarkupBox.LAYOUT_JUSTIFY;
export const FAMILY = TextAttribute.FAMILY;
export const FAMILY_SERIF = "Serif";
export const FAMILY_SANS_SERIF = "SansSerif";
export const FAMILY_MONOSPACED = "Monospace";
export const WEIGHT = TextAttribute.WEIGHT;
export const WEIGHT_EXTRALIGHT = TextAttribute.WEIGHT_EXTRA_LIGHT;
export const WEIGHT_LIGHT = TextAttribute.WEIGHT_LIGHT;
export const WEIGHT_DEMILIGHT = TextAttribute.WEIGHT_DEMILIGHT;
export const WEIGHT_REGULAR = TextAttribute.WEIGHT_REGULAR;
export const WEIGHT_SEMIBOLD = TextAttribute.WEIGHT_SEMIBOLD;
export const WEIGHT_MEDIUM = TextAttribute.WEIGHT_MEDIUM;
export const WEIGHT_DEMIBOLD = TextAttribute.WEIGHT_DEMIBOLD;
export const WEIGHT_BOLD = TextAttribute.WEIGHT_BOLD;
export const WEIGHT_HEAVY = TextAttribute.WEIGHT_HEAVY;
export const WEIGHT_EXTRABOLD = TextAttribute.WEIGHT_EXTRABOLD;
export const WEIGHT_ULTRABOLD = TextAttribute.WEIGHT_ULTRABOLD;
export const WIDTH = TextAttribute.WIDTH;
export const WIDTH_CONDENSED = TextAttribute.WIDTH_CONDENSED;
export const WIDTH_SEMICONDENSED = TextAttribute.WIDTH_SEMI_CONDENSED;
export const WIDTH_SEMI_CONDENSED = TextAttribute.WIDTH_SEMI_CONDENSED;
export const WIDTH_REGULAR = TextAttribute.WIDTH_REGULAR;
export const WIDTH_SEMIEXTENDED = TextAttribute.WIDTH_SEMI_EXTENDED;
export const WIDTH_SEMI_EXTENDED = TextAttribute.WIDTH_SEMI_EXTENDED;
export const WIDTH_EXTENDED = TextAttribute.WIDTH_EXTENDED;
export const POSTURE = TextAttribute.POSTURE;
export const POSTURE_REGULAR = TextAttribute.POSTURE_REGULAR;
export const POSTURE_OBLIQUE = TextAttribute.POSTURE_OBLIQUE;
export const SIZE = TextAttribute.SIZE;
export const SUPERSCRIPT = TextAttribute.SUPERSCRIPT;
export const SUPERSCRIPT_SUPER = TextAttribute.SUPERSCRIPT_SUPER;
export const SUPERSCRIPT_SUB = TextAttribute.SUPERSCRIPT_SUB;
export const FONT_OBJECT = TextAttribute.FONT;
export const COLOUR = TextAttribute.FOREGROUND;
export const COLOR = TextAttribute.FOREGROUND;
export const PAINT = TextAttribute.FOREGROUND;
export const BGCOLOUR = TextAttribute.BACKGROUND;
export const BGCOLOR = TextAttribute.BACKGROUND;
export const BGPAINT = TextAttribute.BACKGROUND;
export const UNDERLINE = TextAttribute.UNDERLINE;
export const UNDERLINE_ON = TextAttribute.UNDERLINE_ON;
export const STRIKETHROUGH = TextAttribute.STRIKETHROUGH;
export const STRIKETHROUGH_ON = TextAttribute.STRIKETHROUGH_ON;
export const SWAP_COLORS = TextAttribute.SWAP_COLORS;
export const SWAP_COLORS_ON = TextAttribute.SWAP_COLORS_ON;
export const SWAP_COLOURS = TextAttribute.SWAP_COLORS;
export const SWAP_COLOURS_ON = TextAttribute.SWAP_COLORS_ON;
export const LIGATURES = TextAttribute.LIGATURES;
export const LIGATURES_ON = TextAttribute.LIGATURES_ON;
export const TRACKING = TextAttribute.TRACKING;
export const TRACKING_TIGHT = TextAttribute.TRACKING_TIGHT;
export const TRACKING_LOOSE = TextAttribute.TRACKING_LOOSE;
