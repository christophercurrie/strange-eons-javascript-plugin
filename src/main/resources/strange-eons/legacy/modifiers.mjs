// Modifier key bitmasks, adapted from Strange Eons' modifiers.js.
import { Java } from "../internal/host.mjs";
const PluginContext = Java.type("ca.cgjennings.apps.arkham.plugins.PluginContext");

export const SHIFT = PluginContext.SHIFT;
export const CONTROL = PluginContext.CONTROL;
export const CTRL = PluginContext.CTRL;
export const ALT = PluginContext.ALT;
export const META = PluginContext.META;
export const COMMAND = PluginContext.COMMAND;

const currentModifiers = () => globalThis.PluginContext.getModifiers();

export function allPressed(modifierState, modifiers) {
    if (modifiers === undefined) {
        modifiers = modifierState;
        modifierState = currentModifiers();
    }
    return (modifierState & (SHIFT | CTRL | ALT | META)) === modifiers;
}

export function anyPressed(modifierState, modifiers) {
    if (modifiers === undefined) {
        modifiers = modifierState;
        modifierState = currentModifiers();
    }
    return (modifierState & modifiers) !== 0;
}
