// Extension plug-in support, adapted from Strange Eons' extension.js.
// A plug-in must re-export getPluginType for the host to find it:
//   export { getPluginType } from "strange-eons/legacy";
import { Java, facade } from "../internal/host.mjs";
export const Game = facade("gamedata.Game", {
    constants: [
        "ALL_GAMES_CODE", "GAME_SETTING_KEY"
    ],
    methods: [
        "get", "getAllGamesInstance", "getGames", "register"
    ]
});
export const Expansion = facade("gamedata.Expansion", {
    constants: [
        "EXPANSION_SETTING_KEY", "Listeners", "VARIANT_SETTING_KEY"
    ],
    methods: [
        "generateEndUserIdentifier", "get", "getBaseGameExpansion",
        "getComponentExpansionSymbols", "getExpansions", "getExpansionsForGame", "register",
        "setComponentExpansionSymbols", "setGameForExpansion"
    ]
});
export const ClassMap = facade("gamedata.ClassMap", {
    constants: [
        "ENTRY_EVERYTHING_CATEGORY"
    ],
    methods: [
        "add", "getClassMapFiles"
    ],
    constructible: true
});
export const ConversionMap = facade("gamedata.ConversionMap", {
    methods: [
        "add", "getShared"
    ],
    constructible: true
});
export const ExpansionSymbolTemplate = facade("gamedata.ExpansionSymbolTemplate", {});
export const AbstractExpansionSymbolTemplate = facade("gamedata.AbstractExpansionSymbolTemplate", {});
export const SymbolVariantUtilities = facade("gamedata.SymbolVariantUtilities", {
    methods: [
        "copy", "createDefaultVariantIcon", "desaturate", "extractSymbol", "isGreyscale",
        "isMonochrome", "outline", "pad", "recolor", "shadow", "standardizeSize", "trim"
    ]
});
export const TileSet = facade("gamedata.TileSet", {
    methods: [
        "add", "getTileSetEntries", "getTileSets"
    ]
});
export const Silhouette = facade("gamedata.Silhouette", {
    constants: [
        "DEFAULT_PORTRAIT", "Listeners"
    ],
    methods: [
        "add", "get", "getSilhouettes", "register", "unregister"
    ],
    constructible: true
});

const Plugin = Java.type("ca.cgjennings.apps.arkham.plugins.Plugin");

export function getPluginType() {
    return Plugin.EXTENSION;
}
