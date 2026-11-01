// Minimal DIY components, adapted from Strange Eons' prefab.js.
import { $, gstring, string } from "./common.mjs";
import { FaceStyle } from "./diy.mjs";
import { LAYOUT_CENTER, LAYOUT_MIDDLE, LAYOUT_TOP, markupBox } from "./markup.mjs";
import { Bindings } from "./uibindings.mjs";
import { label, textArea, textField } from "./uicontrols.mjs";
import { TypeGrid } from "./uilayout.mjs";

const AWTColor = Java.type("java.awt.Color");
const CONTENT = "Content";

/**
 * Creates DIY handler functions driven by settings that begin with
 * {@code baseKey}. {@code hooks} may define the before and after hooks of each
 * handler, such as {@code beforeCreate} and {@code afterPaintFront}.
 *
 *   export const { create, createInterface, createFrontPainter, createBackPainter,
 *       paintFront, paintBack, onClear, onRead, onWrite } = prefab("my-card");
 */
export function prefab(baseKey = "prefab", hooks = {}) {
    let settings;
    let titleBox;
    let contentBox;

    const key = (suffix) => baseKey + suffix;
    const hook = (name, ...args) => hooks[name]?.(...args);

    const text = (suffix, defaultValue = "") => {
        const value = settings.get(key(suffix)) ?? defaultValue;
        if (value == null) {
            return value;
        }
        if (value.startsWith("#")) {
            return gstring(value.substring(1));
        }
        if (value.startsWith("@")) {
            return string(value.substring(1));
        }
        if (value.startsWith("$") && !value.startsWith("$$")) {
            return $(value.substring(1).replace(/_/g, "-"));
        }
        return value;
    };

    const paintOverlay = (g, sheet) => {
        const overlayKey = key("-portrait-overlay");
        const regionKey = key("-portrait-overlay-region");
        if (settings.get(regionKey) == null) {
            sheet.paintImage(g, overlayKey, 0, 0, sheet.getTemplateWidth(), sheet.getTemplateHeight());
        } else {
            sheet.paintImage(g, overlayKey, regionKey);
        }
    };

    return {
        create(diy) {
            settings = diy.getSettings();
            hook("beforeCreate", diy);
            const frontKey = key("-front");
            const backKey = key("-back");
            if (settings.get(frontKey + "-template") == null) {
                throw new Error("front template key not defined: " + frontKey);
            }
            diy.setFrontTemplateKey(frontKey);
            if (settings.get(backKey + "-template") == null) {
                diy.setFaceStyle(FaceStyle.SHARED_FACE);
            } else {
                diy.setBackTemplateKey(backKey);
                const portraitOnBack = settings.getYesNo(key("-portrait-on-back"))
                        && settings.get(key("-portrait-template")) != null;
                diy.setFaceStyle(portraitOnBack ? FaceStyle.TWO_FACES : FaceStyle.PLAIN_BACK);
            }
            diy.setName(text("-name"));
            settings.set(CONTENT, text("-content"));
            if (settings.get(key("-portrait-template")) != null) {
                diy.setPortraitKey(baseKey);
            }
            hook("afterCreate", diy);
        },

        createInterface(diy, editor) {
            hook("beforeCreateInterface", diy, editor);
            const bindings = new Bindings(editor, diy);
            const panel = new TypeGrid();
            const hasName = settings.get(key("-name-region")) != null;
            if (hasName) {
                const nameField = textField();
                const nameLabel = label(text("-name-label", "@prefab-l-name"), nameField);
                diy.setNameField(nameField);
                panel.place(nameLabel, "", nameField, "hfill");
            }
            const hasContent = settings.get(key("-content-region")) != null;
            if (hasContent) {
                const contentField = textArea(null, 15, 0, true);
                const contentLabel = label(text("-content-label", "@prefab-l-content"), contentField.getViewport().getView());
                bindings.add(CONTENT, contentField, [0]);
                panel.place(contentLabel, hasName ? "p" : "", contentField, "br hfill");
            }
            panel.title = text("-panel-title", null);
            hook("afterCreateInterface", diy, editor, panel, bindings);
            bindings.bind();
            if (hasName || hasContent || hooks.afterCreateInterface !== undefined) {
                panel.addToEditor(editor, text("-tab-label", "@prefab-l-tab"), null, null, 0);
            }
        },

        createFrontPainter(diy, sheet) {
            hook("beforeCreateFrontPainter", diy, sheet);
            const makeBox = (suffix, isTitle) => {
                const boxKey = key(suffix);
                if (settings.get(boxKey + "-region") == null) {
                    return null;
                }
                const box = markupBox(sheet);
                if (settings.get(boxKey + "-alignment") == null) {
                    box.setAlignment(LAYOUT_CENTER | (isTitle ? LAYOUT_MIDDLE : LAYOUT_TOP));
                } else {
                    settings.getTextAlignment(boxKey, box);
                }
                if (settings.get(boxKey + "-style") != null) {
                    settings.getTextStyle(boxKey, box.getDefaultStyle());
                }
                return box;
            };
            titleBox = makeBox("-name", true);
            contentBox = makeBox("-content", false);
            hook("afterCreateFrontPainter", diy, sheet);
        },

        createBackPainter(diy, sheet) {
            hook("beforeCreateBackPainter", diy, sheet);
            hook("afterCreateBackPainter", diy, sheet);
        },

        paintFront(g, diy, sheet) {
            hook("beforePaintFront", g, diy, sheet);
            g.setPaint(AWTColor.BLACK);
            let hasOverlay = false;
            if (settings.get(key("-portrait-template")) != null && !settings.getYesNo(key("-portrait-on-back"))) {
                if (settings.get(key("-portrait-overlay")) == null) {
                    sheet.paintPortrait(g);
                } else {
                    hasOverlay = true;
                }
            }
            sheet.paintTemplateImage(g);
            if (hasOverlay) {
                sheet.paintPortrait(g);
            }
            if (titleBox != null) {
                titleBox.setMarkupText(diy.getName());
                if (settings.getYesNo(key("-name-oneliner"))) {
                    titleBox.drawAsSingleLine(g, settings.getRegion(key("-name")));
                } else {
                    titleBox.draw(g, settings.getRegion(key("-name")));
                }
            }
            if (contentBox != null) {
                contentBox.setMarkupText(settings.get(CONTENT));
                contentBox.draw(g, settings.getRegion(key("-content")));
            }
            if (hasOverlay) {
                paintOverlay(g, sheet);
            }
            hook("afterPaintFront", g, diy, sheet);
        },

        // Only called when a portrait is painted on the back face.
        paintBack(g, diy, sheet) {
            hook("beforePaintBack", g, diy, sheet);
            if (settings.get(key("-portrait-overlay")) == null) {
                sheet.paintPortrait(g);
                sheet.paintTemplateImage(g);
            } else {
                sheet.paintTemplateImage(g);
                sheet.paintPortrait(g);
                paintOverlay(g, sheet);
            }
            hook("afterPaintBack", g, diy, sheet);
        },

        onClear(diy) {
            hook("beforeOnClear", diy);
            diy.setName("");
            settings.set(CONTENT, "");
            hook("afterOnClear", diy);
        },

        onRead(diy, ois) {
            ois.readInt();
            settings = diy.getSettings();
            hook("beforeOnRead", diy, ois);
            hook("afterOnRead", diy, ois);
        },

        onWrite(diy, oos) {
            oos.writeInt(1);
            hook("beforeOnWrite", diy, oos);
            hook("afterOnWrite", diy, oos);
        }
    };
}
