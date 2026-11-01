// Project system extensions, adapted from Strange Eons' project.js.
export const File = Java.type("java.io.File");
export const Member = Java.type("ca.cgjennings.apps.arkham.project.Member");
export const Task = Java.type("ca.cgjennings.apps.arkham.project.Task");
export const TaskAction = Java.type("ca.cgjennings.apps.arkham.project.TaskAction");
export const Project = Java.type("ca.cgjennings.apps.arkham.project.Project");
export const Actions = Java.type("ca.cgjennings.apps.arkham.project.Actions");
export const Open = Java.type("ca.cgjennings.apps.arkham.project.Open");
export const ProjectUtilities = Java.type("ca.cgjennings.apps.arkham.project.ProjectUtilities");
export const ProjectUtils = ProjectUtilities;
export const NewTaskType = Java.type("ca.cgjennings.apps.arkham.project.NewTaskType");

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
