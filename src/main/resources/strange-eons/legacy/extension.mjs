// Extension plug-in support, adapted from Strange Eons' extension.js.
// A plug-in must re-export getPluginType for the host to find it:
//   export { getPluginType } from "strange-eons/legacy";
export const Game = Java.type("gamedata.Game");
export const Expansion = Java.type("gamedata.Expansion");
export const ClassMap = Java.type("gamedata.ClassMap");
export const ConversionMap = Java.type("gamedata.ConversionMap");
export const ExpansionSymbolTemplate = Java.type("gamedata.ExpansionSymbolTemplate");
export const AbstractExpansionSymbolTemplate = Java.type("gamedata.AbstractExpansionSymbolTemplate");
export const SymbolVariantUtilities = Java.type("gamedata.SymbolVariantUtilities");
export const TileSet = Java.type("gamedata.TileSet");
export const Silhouette = Java.type("gamedata.Silhouette");

const Plugin = Java.type("ca.cgjennings.apps.arkham.plugins.Plugin");

export function getPluginType() {
    return Plugin.EXTENSION;
}
