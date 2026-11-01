// Script library registry access, adapted from Strange Eons' libutils.js.
const LibraryRegistry = Java.type("ca.cgjennings.apps.arkham.plugins.LibraryRegistry");
const ScriptMonkey = Java.type("ca.cgjennings.apps.arkham.plugins.ScriptMonkey");

export const LibUtils = {
    get registeredLibraries() {
        return LibUtils.getRegisteredLibraries();
    },
    get(library) {
        return ScriptMonkey.getLibrary(library);
    },
    register(library) {
        LibraryRegistry.register(library);
    },
    isRegistered(library) {
        return LibraryRegistry.isRegistered(library);
    },
    exists(library) {
        try {
            LibUtils.get(library);
            return true;
        } catch (ex) {
            return false;
        }
    },
    getRegisteredLibraries() {
        return Array.from(LibraryRegistry.getLibraries());
    }
};
