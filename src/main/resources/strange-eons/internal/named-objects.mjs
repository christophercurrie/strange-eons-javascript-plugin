// Property-style access to the application's named object database, as
// Strange Rhino scripts use it: db.name reads, db.name = value stores, and
// delete db.name removes.

/** Returns a view of a database with getObject, putObject and removeObject. */
export function namedObjectView(database) {
    return new Proxy(Object.create(null), {
        get: (target, name) => (typeof name === "string" ? database.getObject(name) : undefined),
        set: (target, name, value) => {
            if (typeof name !== "string") {
                return false;
            }
            database.putObject(name, value);
            return true;
        },
        has: (target, name) => typeof name === "string" && database.getObject(name) != null,
        deleteProperty: (target, name) => {
            if (typeof name === "string") {
                database.removeObject(name);
            }
            return true;
        },
        defineProperty: () => false
    });
}
