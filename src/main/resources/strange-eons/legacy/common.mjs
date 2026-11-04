// Core script library functions, adapted from Strange Eons' common.js.
import { Java, facade } from "../internal/host.mjs";
import { namedObjectView } from "../internal/named-objects.mjs";

export const Eons = facade("ca.cgjennings.apps.arkham.StrangeEons", {
    constants: [
        "MARKUP_TARGET_PROPERTY", "RECOMMENDED_MEMORY_IN_MB", "log"
    ],
    methods: [
        "addEditor", "getActiveEditor", "getActiveGameComponent", "getApplication",
        "getBuildNumber", "getEditionNumber", "getLogEntries", "getOpenProject",
        "getRegisteredExportContainers", "getReleaseType", "getSafeStartupParentWindow",
        "getScriptRunner", "getUrlForDocPage", "getUserStorageFile", "getVersionString",
        "getWindow", "isNonInteractive", "main", "registerExportContainer", "setWaitCursor",
        "testJavaVersion", "unregisterExportContainer"
    ],
    properties: {
        namedObjects: () => namedObjects()
    }
});

let namedObjectsView;
function namedObjects() {
    return (namedObjectsView ??= namedObjectView(
            Java.type("ca.cgjennings.apps.arkham.StrangeEons").getApplication().getNamedObjects()));
}
export const ResourceKit = facade("resources.ResourceKit", {
    methods: [
        "composeResourceURL", "createBleedBanner", "createCustomCursor",
        "createPrintRequestAttributeSet", "createWaitIcon", "enableKerningAndLigatures",
        "estimateDesktopScalingFactor", "findAvailableFontFamily", "findResourceInProject",
        "getBodyFamily", "getBodyFont", "getEditorFont", "getFont", "getGameComponentFromFile",
        "getGameComponentFromStream", "getIcon", "getIdentifier", "getImage",
        "getImageQuietly", "getImagesQuietly", "getInputStream", "getMicroversionString",
        "getMissingImage", "getMissingVectorImage", "getRegisteredCacheMetrics",
        "getThemedImage", "getTinyFont", "getVectorIcon", "getVectorImage",
        "initializeFileDialogs", "isFamilyRegistered", "isResourceStatic",
        "makeStringFileSafe", "makeStringHTMLSafe", "missingKeyError",
        "normalizeFontFamilyName", "normalizeResourceIdentifier", "prepareNewImage",
        "registerCacheMetrics", "registerFont", "registerFontFamily",
        "showBitmapImageFileDialog", "showFolderDialog", "showGenericExportFileDialog",
        "showGenericOpenDialog", "showGenericSaveDialog", "showImageFileDialog",
        "showMultiOpenDialog", "showOpenDialog", "showPluginFileDialog", "showPrintDialog",
        "showProjectFolderDialog", "showSaveDialog", "showScriptFileDialog",
        "showZipFileDialog", "unregisterCacheMetrics", "writeGameComponentToFile"
    ]
});
export const Language = facade("resources.Language", {
    methods: [
        "addGameLocale", "addInterfaceLocale", "getGame", "getGameLocale", "getGameLocales",
        "getIconForCountry", "getIconForLanguage", "getIconForLocale", "getInterface",
        "getInterfaceLocale", "getInterfaceLocales", "getLocales", "gstring",
        "isLocaleDescriptionValid", "parseLocaleDescription", "setGameLocale",
        "setInterfaceLocale", "string"
    ],
    constructible: true
});
export const Settings = facade("resources.Settings", {
    constants: [
        "DEBUG_LISTENER"
    ],
    methods: [
        "color", "colour", "cupShape", "forProperties", "getShared", "getUser", "integer",
        "number", "region", "region2D", "textAlignment", "textStyle", "tint", "yesNo"
    ],
    constructible: true
});
export const Color = facade("resources.Settings$Colour", {
    constants: [
        "BITMASK", "BLACK", "BLUE", "CYAN", "DARK_GRAY", "GRAY", "GREEN", "LIGHT_GRAY",
        "MAGENTA", "OPAQUE", "ORANGE", "PINK", "RED", "TRANSLUCENT", "WHITE", "YELLOW",
        "black", "blue", "cyan", "darkGray", "gray", "green", "lightGray", "magenta", "orange",
        "pink", "red", "white", "yellow"
    ],
    methods: [
        "HSBtoRGB", "RGBtoHSB", "decode", "from", "getColor", "getHSBColor"
    ],
    constructible: true
});
export const Colour = Color;
export const Region = facade("resources.Settings$Region", {
    constants: [
        "OUT_BOTTOM", "OUT_LEFT", "OUT_RIGHT", "OUT_TOP"
    ],
    methods: [
        "intersect", "union"
    ],
    constructible: true
});
export const Region2D = facade("resources.Settings$Region2D", {
    constants: [
        "OUT_BOTTOM", "OUT_LEFT", "OUT_RIGHT", "OUT_TOP"
    ],
    methods: [
        "intersect", "union"
    ],
    constructible: true
});
export const StrangeImage = facade("resources.StrangeImage", {
    methods: [
        "create", "exists", "get", "getAsBufferedImage", "getInvisibleImage", "getMissingImage",
        "identifierToURL", "isFileIdentifier"
    ]
});
export const Font = Java.type("java.awt.Font");
export const URL = Java.type("java.net.URL");

const EventQueue = Java.type("java.awt.EventQueue");
const JOptionPane = Java.type("javax.swing.JOptionPane");
const JavaThread = Java.type("java.lang.Thread");
const Level = Java.type("java.util.logging.Level");
const Locale = Java.type("java.util.Locale");
const Throwable = Java.type("java.lang.Throwable");
const ThreadDeath = Java.type("java.lang.ThreadDeath");
const GameComponent = Java.type("ca.cgjennings.apps.arkham.component.GameComponent");
const LibImpl = Java.type("ca.cgjennings.apps.arkham.plugins.LibImpl");
const Messenger = Java.type("ca.cgjennings.apps.arkham.dialog.Messenger");
const RawSettings = Java.type("resources.RawSettings");
const ScriptDebugging = Java.type("ca.cgjennings.apps.arkham.plugins.debugging.ScriptDebugging");
const ScriptMonkey = Java.type("ca.cgjennings.apps.arkham.plugins.ScriptMonkey");

/** Throws an error unless called from the event dispatch thread. */
export function assertDispatchThread() {
    if (!EventQueue.isDispatchThread()) {
        throw new Error("UI code can only be run in the event dispatch thread: use Thread.invokeLater()");
    }
}

function defaultDialogTitle() {
    const plugin = globalThis.PluginContext?.getPlugin();
    return plugin == null ? "Strange Eons" : `Strange Eons (${plugin.getPluginName()})`;
}

function defineHidden(target, name, value) {
    Object.defineProperty(target, name, { value, writable: true, configurable: true, enumerable: false });
}

defineHidden(Object.prototype, "dontEnum", function dontEnum(...names) {
    for (const name of names) {
        Object.defineProperty(this, name, { enumerable: false });
    }
});

defineHidden(Function.prototype, "subclass", function subclass(superConstructor) {
    this.prototype = Object.create(superConstructor.prototype, {
        constructor: { value: this, writable: true, configurable: true, enumerable: false }
    });
});

Error.error = function error(exception) {
    if (exception == null) {
        exception = "unspecified error";
    } else if (exception instanceof Throwable || exception instanceof Error) {
        throw exception;
    }
    throw new Error(String(exception));
};

if (Settings.getShared().getBoolean("script-warnings")) {
    Error.warn = function warn(message) {
        ScriptMonkey.getConsoleWarningWriter().println(message || "unspecified warning");
    };
    Error.deprecated = function deprecated(message) {
        Error.warn("[DEPRECATED] " + (message || "unspecified feature"));
    };
} else {
    Error.warn = () => undefined;
    Error.deprecated = Error.warn;
}

Error.handleUncaught = function handleUncaught(exception) {
    if (exception instanceof ThreadDeath) {
        throw exception;
    }
    if (exception instanceof Throwable) {
        ScriptMonkey.scriptError(exception);
    } else {
        Console.err.print("\nUncaught ");
        Console.err.print(String(exception));
    }
};

export function prompt(promptMessage, initialValue) {
    assertDispatchThread();
    return JOptionPane.showInputDialog(Eons.getSafeStartupParentWindow(), promptMessage || "", initialValue || "");
}

function confirmHelper(promptMessage, title, optionType) {
    assertDispatchThread();
    if (promptMessage == null) {
        throw new TypeError("no promptMessage");
    }
    return JOptionPane.OK_OPTION === JOptionPane.showConfirmDialog(
            Eons.getSafeStartupParentWindow(), promptMessage, title || defaultDialogTitle(), optionType);
}

export function confirm(promptMessage, title) {
    return confirmHelper(promptMessage, title, JOptionPane.OK_CANCEL_OPTION);
}
confirm.confirm = confirm;
confirm.yesno = function yesno(promptMessage, title) {
    return confirmHelper(promptMessage, title, JOptionPane.YES_NO_OPTION);
};
confirm.choose = function choose(promptMessage, title, ...options) {
    assertDispatchThread();
    if (options.length === 0) {
        throw new TypeError("no options");
    }
    return JOptionPane.showOptionDialog(
            Eons.getSafeStartupParentWindow(), promptMessage, title || defaultDialogTitle(),
            JOptionPane.DEFAULT_OPTION, JOptionPane.QUESTION_MESSAGE, null, options, options[0]);
};

export function alert(message, isErrorMessage) {
    assertDispatchThread();
    if (!message) {
        throw new TypeError("no message");
    }
    if (isErrorMessage === true) {
        Messenger.displayErrorMessage(null, message);
    } else if (isErrorMessage === false) {
        Messenger.displayWarningMessage(null, message);
    } else {
        Messenger.displayMessage(null, message);
    }
}

export function sleep(msDelay) {
    try {
        JavaThread.sleep(msDelay >= 0 ? Math.trunc(msDelay) : 1000);
    } catch (interrupted) {
        return true;
    }
    return false;
}

export function sprintf(...args) {
    let loc = args[0];
    if (loc instanceof Language) {
        loc = loc.getLocale();
    }
    let firstObj = 1;
    if (loc == null || loc instanceof Locale) {
        firstObj = 2;
    } else {
        loc = Language.getInterfaceLocale();
    }
    if (args.length < firstObj) {
        return "";
    }
    return LibImpl.sprintf(loc, args[firstObj - 1], Java.to(args.slice(firstObj), "java.lang.Object[]"));
}

export function print(...objects) {
    for (const object of objects) {
        Console.out.printObj(object);
    }
}

export function println(...objects) {
    print(...objects);
    Console.out.println();
}

export function printf(...args) {
    Console.out.printObj(sprintf(...args));
}

export const Console = {
    get out() {
        return ScriptMonkey.getConsoleWriter();
    },
    get err() {
        return ScriptMonkey.getConsoleErrorWriter();
    },
    get visible() {
        const console = ScriptMonkey.getSharedConsole();
        return console != null && console.isVisible();
    },
    set visible(b) {
        ScriptMonkey.getSharedConsole()?.setVisible(b);
    },
    print,
    println,
    printImage(image) {
        this.out.insertImage(image);
    },
    printComponent(uiComponent) {
        this.out.insertComponent(uiComponent);
    },
    printHTML(html) {
        this.out.insertHTML(html);
    },
    clear() {
        ScriptMonkey.getSharedConsole()?.clear();
    },
    scrollToTop() {
        ScriptMonkey.getSharedConsole()?.scrollToTop();
    },
    scrollToBottom() {
        ScriptMonkey.getSharedConsole()?.scrollToBottom();
    },
    history() {
        return ScriptMonkey.getSharedConsole()?.getHistoryText() ?? "";
    },
    queue() {
        ScriptMonkey.getSharedConsole()?.queue();
    },
    flush() {
        ScriptMonkey.flushConsole();
    }
};

let uiLanguage = null;
let gameLanguage = null;
let settingProvider = null;

function localized(language, key, args) {
    const str = language.str(key);
    return args.length > 0 ? LibImpl.sprintf(language.getLocale(), str, Java.to(args, "java.lang.Object[]")) : str;
}

export function useInterfaceLanguage(language) {
    uiLanguage = language;
}

export function string(key, ...args) {
    return localized(uiLanguage ?? Language.getInterface(), key, args);
}

export function useGameLanguage(language) {
    gameLanguage = language;
}

export function gstring(key, ...args) {
    return localized(gameLanguage ?? Language.getGame(), key, args);
}

export function useSettings(source) {
    if (source == null) {
        settingProvider = null;
    } else if (source instanceof GameComponent) {
        settingProvider = source.getSettings();
    } else if (source instanceof Settings) {
        settingProvider = source;
    } else {
        Error.error("source is not a Settings instance or game component");
    }
}

/** Returns the settings used by {@link $}, set with {@link useSettings}. */
export function currentSettings() {
    return settingProvider ?? Settings.getShared();
}

export function $(key) {
    return currentSettings().get(key);
}

export const Patch = {
    apply(...args) {
        if (args.length % 2 !== 0) {
            Error.error(string("scriptlib-common-patchargs"));
        }
        const s = Settings.getUser();
        for (let i = 0; i < args.length; i += 2) {
            const oldValue = s.get(args[i]);
            s.set(args[i], args[i + 1]);
            println(string("scriptlib-common-patch-apply", args[i], args[i + 1], oldValue));
        }
        RawSettings.writeUserSettings();
        println("OK");
    },
    restore(...keys) {
        const user = Settings.getUser();
        for (const key of keys) {
            user.reset(key);
        }
        RawSettings.writeUserSettings();
        for (const key of keys) {
            println(string("scriptlib-common-patch-restore", key, Settings.getShared().get(key)));
        }
        println("OK");
    },
    temporary(...args) {
        if (args.length % 2 !== 0) {
            Error.error(string("scriptlib-common-patchargs"));
        }
        for (let i = 0; i < args.length; i += 2) {
            RawSettings.setGlobalSetting(args[i], args[i + 1]);
        }
    },
    card(card, ...args) {
        if (args.length < 2 || args.length % 2 !== 0) {
            Error.error("Patch.card(): invalid number of arguments: " + (args.length + 1));
        }
        const privateSettings = card.getSettings();
        for (let i = 0; i < args.length; i += 2) {
            privateSettings.set(args[i], args[i + 1]);
        }
    },
    cardFrom(card, resourcePath) {
        card.getSettings().addSettingsFrom(resourcePath);
    },
    cardRestore(card, ...keys) {
        if (keys.length === 0) {
            Error.error("Patch.cardRestore(): invalid number of arguments: 1");
        }
        const privateSettings = card.getSettings();
        for (const key of keys) {
            privateSettings.reset(key);
        }
    }
};

const debugging = ScriptDebugging.isInstalled();

export function debug(...args) {
    if (debugging) {
        Eons.log.logp(Level.INFO, "strange-eons/legacy", "debug", sprintf(...args));
    }
}

export function assert(condition, message) {
    if (debugging && !condition) {
        const text = "ASSERTION FAILURE" + (message == null ? "" : ": " + String(message));
        debug("%s", text);
        throw new Error(text);
    }
}

defineHidden(Number.prototype, "toInt", function toInt() {
    return Math.trunc(this);
});
defineHidden(Number.prototype, "toLong", function toLong() {
    return Math.trunc(this);
});
defineHidden(Number.prototype, "toFloat", function toFloat() {
    return Math.fround(this);
});

RegExp.quote = (s) => s.replace(/([.*+?^$|(){}[\]\\])/g, "\\$1");
RegExp.quoteReplacement = (s) => s.replace(/\$/g, "$$$$");

defineHidden(String.prototype, "replaceAll", function replaceAll(pattern, replacement) {
    return this.replace(new RegExp(RegExp.quote(pattern), "g"), RegExp.quoteReplacement(replacement));
});

Function.abstractMethod = function () {
    Error.warn("call to abstract method: this method needs to be overridden in the subclass");
};
