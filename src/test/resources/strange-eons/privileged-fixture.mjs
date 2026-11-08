import { Java, facade } from "./internal/host.mjs";
import { namedObjectView } from "./internal/named-objects.mjs";

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
export const Callable = facade("java.util.ArrayList", {
    callable: true
});
export const WithProperty = facade("java.util.ArrayList", {
    properties: { answer: () => 42 }
});
export const Extensible = facade("java.util.AbstractList", {
    extensible: true
});
export const view = namedObjectView;
