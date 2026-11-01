// Font lookup and registration, adapted from Strange Eons' fontutils.js.
import { currentSettings, Language, ResourceKit } from "./common.mjs";

const GraphicsEnvironment = Java.type("java.awt.GraphicsEnvironment");

export const FontUtils = {
    findMatchingFamily(families, defaultFamily = ResourceKit.getBodyFamily()) {
        return ResourceKit.findAvailableFontFamily(families, defaultFamily);
    },
    availableFontFamilies() {
        return Array.from(GraphicsEnvironment.getLocalGraphicsEnvironment()
                .getAvailableFontFamilyNames(Language.getInterfaceLocale()));
    },
    registerFontFamily(key) {
        return currentSettings().registerFontFamily(key);
    },
    registerFontFamilyFromResources(...resources) {
        if (resources.length === 0) {
            throw new Error("at least one resource file name required");
        }
        return ResourceKit.registerFontFamily(resources.join(","))[0].getFamily();
    }
};
