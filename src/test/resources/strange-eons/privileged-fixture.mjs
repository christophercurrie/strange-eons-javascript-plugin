import { Java, facade } from "./internal/host.mjs";

const Exception = Java.type("org.strangeeons.scripts.ScriptException");
export const hiddenClassName = () => new Exception("hidden").getMessage();

export const Hidden = facade("org.strangeeons.scripts.ScriptException", {
    constructible: true
});
export const Sealed = facade("org.strangeeons.scripts.ScriptLanguage");
export const Inherited = facade("java.util.LinkedHashMap", {
    methods: ["newHashMap"]
});
export const InterfaceConstant = facade("javax.swing.JSeparator", {
    constants: ["VERTICAL"]
});
