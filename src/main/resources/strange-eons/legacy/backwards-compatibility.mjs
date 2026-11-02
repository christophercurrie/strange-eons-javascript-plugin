// Older script library names, adapted from Strange Eons'
// backwards-compatibility.js.
import { Java } from "../internal/host.mjs";
import { alert, Console, Settings, string, useSettings } from "./common.mjs";
import { ClassMap, Expansion, Game } from "./extension.mjs";
import { FontUtils } from "./fontutils.mjs";
import { BufferedImage, ImageUtils } from "./imageutils.mjs";

const ImageUtilities = Java.type("ca.cgjennings.graphics.ImageUtilities");

export const usesettings = useSettings;
export const subclass = (constructor, superConstructor) => constructor.subclass(superConstructor);
export const error = (s) => Error.error(s);
error.handleUncaught = (ex) => Error.handleUncaught(ex);
error.missingLibrary = function (shortName, fileName) {
    alert(string("scriptlib-missing-lib-alert", shortName, fileName), true);
    Error.error(string("scriptlib-missing-lib", fileName));
};
export const hide = () => {
    Console.visible = false;
};

export const offerToHideArkhamHorror = () => undefined;

const toImage = (image) => (image instanceof BufferedImage ? image : ImageUtils.get(image.toString()));

export const GameData = {
    registerGame(code, gameName, iconImage) {
        Game.register(code, gameName, gameName, iconImage == null ? null : toImage(iconImage), null);
    },
    registerExpansion(code, name, iconImage, cardImage, invCardImage) {
        const icon = toImage(iconImage ?? "icons/un-expansion-icon.png");
        const card = toImage(cardImage ?? "expansiontokens/XX.png");
        const inverted = invCardImage == null
                ? ImageUtilities.invert(ImageUtilities.desaturate(card))
                : toImage(invCardImage);
        Expansion.register(Game.getAllGamesInstance(), code, name, name, icon, [card, inverted]);
    },
    setGameForExpansion(exp, game) {
        Expansion.setGameForExpansion(exp, game);
    },
    parseEditors(resource) {
        ClassMap.add(resource);
    },
    parseSettings(resource) {
        Settings.getShared().addSettingsFrom(resource);
    }
};

export const availableFontFamilies = () => FontUtils.availableFontFamilies();
export const registerFontFamily = (key) => FontUtils.registerFontFamily(key);
export const findMatchingFamily = (families, defaultFamily) => FontUtils.findMatchingFamily(families, defaultFamily);
export const registerFontFamilyFromResources = (...resources) => FontUtils.registerFontFamilyFromResources(...resources);

export const Image = {
    STITCH_HORIZONTAL: 1,
    STITCH_VERTICAL: 2,
    HORIZONTAL: 1,
    VERTICAL: 2,
    create: (w, h, t) => ImageUtils.create(w, h, t),
    createForResolution: (d, w, h, t) => ImageUtils.createForResolution(d, w, h, t),
    fetchImageResource: (u, c) => ImageUtils.get(u, c),
    fetchIconResource: (u) => ImageUtils.getIcon(u),
    createIcon: (i, s) => ImageUtils.createIcon(i, s),
    stitch: (i1, i2, e) => ImageUtils.stitch(i1, i2, e),
    resize: (i, w, h, f) => ImageUtils.resize(i, w, h, f),
    fit: (i, w, h, f) => ImageUtils.fit(i, w, h, f),
    crop: (i, x, y, w, h) => ImageUtils.crop(i, x, y, w, h),
    tint: (i, h, s, b) => ImageUtils.tint(i, h, s, b),
    mirror: (i, h, v) => ImageUtils.mirror(i, h, v),
    invert: (i) => ImageUtils.invert(i),
    desaturate: (i) => ImageUtils.desaturate(i),
    read: (f) => ImageUtils.read(f),
    write: (i, f, r, q, p, d) => ImageUtils.write(i, f, r, q, p, d),
    save: (i, f) => ImageUtils.save(i, f),
    view: (i, t, m) => ImageUtils.view(i, t, m)
};
