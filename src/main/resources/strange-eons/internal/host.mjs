// Host access boundary. Evaluated first in every session. Library modules
// import the real Java object from here; plug-in code sees the filtered global
// and cannot import this module.
const realJava = globalThis.Java;

const ALLOWED = [
    /^java\.(awt|io|math|net|nio|text|time|util)\./,
    /^javax\.(imageio|swing)\./,
    /^ca\.cgjennings\.graphics\.filters\./,
    /^java\.lang\.(Boolean|Byte|Character|Double|Float|Integer|Long|Math|Number|Short|StrictMath|String|StringBuilder)$/
];
const DENIED = /^java\.(net\.URLClassLoader|util\.ServiceLoader)(\$|$)/;
const PRIMITIVE = /^(boolean|byte|char|double|float|int|long|short)$/;

function isAllowed(className) {
    return !DENIED.test(className) && ALLOWED.some((pattern) => pattern.test(className));
}

function requireAllowed(className) {
    const name = String(className);
    if (!isAllowed(name)) {
        throw new TypeError("class is not available to plug-in scripts: " + name);
    }
    return name;
}

function requireAllowedArrayType(typeName) {
    if (typeName === undefined) {
        return undefined;
    }
    const name = String(typeName);
    const element = name.replace(/(\[\])+$/, "");
    if (!PRIMITIVE.test(element)) {
        requireAllowed(element);
    }
    return name;
}

Object.defineProperty(globalThis, "Java", {
    value: Object.freeze({
        type: (className) => realJava.type(requireAllowed(className)),
        to: (value, typeName) => realJava.to(value, requireAllowedArrayType(typeName)),
        from: (value) => realJava.from(value),
        isJavaObject: (value) => realJava.isJavaObject(value),
        isType: (value) => realJava.isType(value)
    }),
    writable: false,
    configurable: false,
    enumerable: false
});

// Nashorn compatibility mode adds bean properties, plus these extras.
for (const name of ["exit", "quit", "JSAdapter", "parseToJSON"]) {
    delete globalThis[name];
}
delete Object.bindProperties;

export const Java = realJava;

const hostClasses = () => realJava.type("org.strangeeons.graaljs.HostClasses");

/**
 * Creates the plug-in facing form of an application class, exposing only the
 * listed static members and the read-only {@code properties}, each given by a
 * function that computes its value. It supports {@code instanceof}, and
 * {@code new} when {@code constructible} is set. A {@code callable} facade also
 * constructs when called without {@code new}, as Strange Rhino allows.
 */
export function facade(className,
        { constants = [], methods = [], properties = {}, constructible = false, callable = false } = {}) {
    let cached;
    const type = () => (cached ??= realJava.type(className));
    // Java.type exposes declared statics only, so inherited members are read
    // from the class that declares them.
    const owner = (name) => realJava.type(hostClasses().declaringClass(className, name));
    const target = function (...args) {
        if (!(constructible || callable) || (!new.target && !callable)) {
            throw new TypeError(className + " cannot be called or constructed here");
        }
        return new (type())(...args);
    };
    Object.defineProperty(target, "name", { value: className.substring(className.search(/[^.$]+$/)) });
    Object.defineProperty(target, Symbol.hasInstance, { value: (value) => value instanceof type() });
    for (const name of constants) {
        Object.defineProperty(target, name, { get: () => owner(name)[name], enumerable: true });
    }
    for (const name of methods) {
        Object.defineProperty(target, name, { value: (...args) => owner(name)[name](...args), enumerable: true });
    }
    for (const [name, get] of Object.entries(properties)) {
        Object.defineProperty(target, name, { get, enumerable: true });
    }
    return Object.freeze(target);
}
