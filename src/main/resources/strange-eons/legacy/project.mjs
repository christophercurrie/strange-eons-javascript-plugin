// Project system extensions, adapted from Strange Eons' project.js.
import { Java, facade } from "../internal/host.mjs";
export const File = Java.type("java.io.File");
export const Member = facade("ca.cgjennings.apps.arkham.project.Member", {
    methods: [
        "getExcludedFilePatterns", "isFileExcluded", "registerMetadataSource",
        "setExcludedFilePatterns", "unregisterMetadataSource"
    ],
    constructible: true
});
export const Task = facade("ca.cgjennings.apps.arkham.project.Task", {
    constants: [
        "KEY_ICON", "KEY_SUBTYPE", "KEY_TYPE"
    ],
    methods: [
        "createTask", "getCustomIcons", "getExcludedFilePatterns", "isFileExcluded",
        "isTaskFolder", "registerCustomIcon", "registerMetadataSource",
        "setExcludedFilePatterns", "unregisterCustomIcon", "unregisterMetadataSource"
    ],
    constructible: true
});
export const TaskAction = facade("ca.cgjennings.apps.arkham.project.TaskAction", {});
export const Project = facade("ca.cgjennings.apps.arkham.project.Project", {
    constants: [
        "KEY_ICON", "KEY_RESOURCE_ID", "KEY_SUBTYPE", "KEY_TYPE", "PROJECT_TASK_TYPE"
    ],
    methods: [
        "createProject", "createTask", "getCustomIcons", "getExcludedFilePatterns",
        "isFileExcluded", "isProjectFolder", "isProjectPackage", "isTaskFolder", "open",
        "registerCustomIcon", "registerMetadataSource", "setExcludedFilePatterns", "unpackage",
        "unregisterCustomIcon", "unregisterMetadataSource"
    ],
    constructible: true
});
export const Actions = facade("ca.cgjennings.apps.arkham.project.Actions", {
    constants: [
        "PRIORITY_BUILD", "PRIORITY_BUILD_SECONDARY", "PRIORITY_CLIPBOARD",
        "PRIORITY_DEBUGGING_TOOL", "PRIORITY_DEFAULT", "PRIORITY_FILE_MANAGEMENT",
        "PRIORITY_FILE_MANAGEMENT_SECONDARY", "PRIORITY_IMPORT_EXPORT", "PRIORITY_MAX",
        "PRIORITY_MIN", "PRIORITY_STANDARD_FIRST", "PRIORITY_STANDARD_LAST"
    ],
    methods: [
        "findActionByName", "getPriorityForAction", "getRootActions", "getUnspecializedAction",
        "register", "unregister"
    ]
});
export const Open = facade("ca.cgjennings.apps.arkham.project.Open", {
    methods: [
        "deleteOpenRule", "getOpenRule", "getRuleCommand", "getRuleExtensions",
        "registerOpener", "runCommand", "setOpenRule", "setRuleCommand", "splitCommand",
        "unregisterOpener"
    ],
    constructible: true
});
export const ProjectUtilities = facade("ca.cgjennings.apps.arkham.project.ProjectUtilities", {
    constants: [
        "BUNDLE_EXTENSIONS", "ENC_SCRIPT", "ENC_SETTINGS", "ENC_UI_PROPERTIES", "ENC_UTF8",
        "IMAGE_EXTENSIONS"
    ],
    methods: [
        "changeExtension", "contains", "copyFile", "copyFolder", "copyReader",
        "copyResourceToFile", "copyStream", "copyToArchive", "createPluginBundleArchive",
        "deleteAll", "exec", "execAsync", "formatByteSize", "getAvailableFile",
        "getFileAsString", "getFileExtension", "getFileText", "getResourceText",
        "listMatchingMembers", "makeFileRelativeTo", "matchExtension", "merge", "moveFile",
        "runScript", "sameFile", "saveAllOpenProjectFiles", "saveIfBeingEdited", "simplify",
        "writeTextFile"
    ]
});
export const ProjectUtils = ProjectUtilities;
export const NewTaskType = facade("ca.cgjennings.apps.arkham.project.NewTaskType", {
    constants: [
        "CASEBOOK_TYPE", "DECK_TYPE", "DOCUMENTATION_TYPE", "EXPANSION_BOARD_TYPE",
        "FACTORY_SCRIPTED_SUBTYPE", "FACTORY_TYPE", "GENERIC_TYPE", "PLUGIN_TYPE",
        "TASK_GROUP_TYPE"
    ],
    methods: [
        "getNewTaskTypes", "isRegistered", "register", "unregister"
    ]
});

const trackers = [];

export function TrackedRegistry(regFn, unregFn) {
    if (regFn == null) {
        throw new Error("null regFn");
    }
    if (unregFn == null) {
        throw new Error("null unregFn");
    }
    let registered = [];

    this.register = function register(entity, ...rest) {
        regFn(entity, ...rest);
        registered.push(entity);
    };

    this.unregister = function unregister(entity, ...rest) {
        unregFn(entity, ...rest);
        const index = registered.indexOf(entity);
        if (index >= 0) {
            registered.splice(index, 1);
        }
    };

    this.unregisterAll = function unregisterAll() {
        for (const entity of registered) {
            unregFn(entity);
        }
        registered = [];
    };

    trackers.push(this);
}

export const ActionRegistry = new TrackedRegistry(
        (action, priority = Actions.PRIORITY_DEFAULT) => Actions.register(action, priority),
        (action) => Actions.unregister(action));

export const NewActionRegistry = new TrackedRegistry(
        (action, after) => {
            const newAction = Actions.getUnspecializedAction("new");
            let index = -1;
            if (after != null) {
                const target = after instanceof TaskAction ? after : newAction.findActionByName(after.toString());
                if (target != null) {
                    index = newAction.indexOf(target);
                }
            }
            newAction.add(index < 0 ? newAction.size() - 1 : index, action);
        },
        (action) => Actions.getUnspecializedAction("new").remove(action));

export const OpenerRegistry = new TrackedRegistry(
        (opener) => Actions.getUnspecializedAction("open").registerOpener(opener),
        (opener) => Actions.getUnspecializedAction("open").unregisterOpener(opener));

export const MetadataRegistry = new TrackedRegistry(
        (source) => Member.registerMetadataSource(source),
        (source) => Member.unregisterMetadataSource(source));

export const NewTaskTypeRegistry = new TrackedRegistry(
        (type) => NewTaskType.register(type),
        (type) => NewTaskType.unregister(type));

export function unregisterAll() {
    for (const tracker of trackers) {
        try {
            tracker.unregisterAll();
        } catch (ex) {
            Error.handleUncaught(ex);
        }
    }
}
