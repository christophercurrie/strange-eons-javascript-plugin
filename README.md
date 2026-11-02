# strange-eons-javascript-plugin

Registers [GraalJS](https://www.graalvm.org/javascript/) as a scripting
language with Strange Eons through the `org.strangeeons.scripts.ScriptLanguage`
SPI, giving plug-in authors current ECMAScript (classes with private fields,
optional chaining, `??`, ES modules, `Intl`, etc.) alongside the built-in
Strange Rhino engine.

When a plug-in's `eons-plugin` manifest declares `script-language = ecmascript`,
SE looks up this implementation via `ServiceLoader` and runs the plug-in's
script in a `GraalJSSession` (one polyglot `Context` per plug-in, all sharing
one process-wide `Engine`).

The id is not `javascript` because SE reserves that value (any case), along
with a missing `script-language`, for Strange Rhino.

## Status

Pre-release. Depends on the unreleased script-language SPI,
`org.strangeeons:strange-eons-script-api`, published as a snapshot.

- `org.strangeeons.graaljs.GraalJSLanguage` — `ScriptLanguage` with id
  `ecmascript` (display name "JavaScript"), extension `.mjs`.
- `org.strangeeons.graaljs.GraalJSSession` — `ScriptSession` over a GraalJS
  `Context`. `.mjs` sources are evaluated as ES modules and their exports are
  callable; other sources are classic scripts whose global functions are
  callable.
- `.selibrary` packaging via
  [strange-eons-gradle-plugin](https://github.com/strange-eons/strange-eons-gradle-plugin)
  (GraalJS/Truffle merged in, not relocated; `META-INF/services` merged).

## Usage

In the plug-in bundle's `eons-plugin`:

```properties
script-language = ecmascript
res://mygame/plugin.mjs
```

The `res://` prefix is required for `.mjs` entries: SE only auto-detects
`.js` names as scripts. A `.js` entry also works and is evaluated as a
classic script.

`plugin.mjs`:

```js
const JOptionPane = Java.type('javax.swing.JOptionPane');

export const getName = () => 'Hello GraalJS';
export const getDescription = () => 'Minimal modern-JS plug-in';
export const getVersion = () => 1.0;

export function run() {
  JOptionPane.showMessageDialog(null, `Hi from ${getName()}`);
}
```

The host resolves the same lifecycle names as for Rhino plug-ins
(`initialize`, `getName`, `getDescription`, `getVersion`, `getPluginType`,
`run`, `hide`, `isShowing`, `isUsable`, `getDefaultAcceleratorKey`,
`unload`). `PluginContext` is bound as a global.

### What plug-in scripts do not get

- **No automatic script library.** SE's Rhino libraries are not loaded. Import
  the port below.
- **No direct access to application classes.** `Java.type` serves an allowlist
  of JDK classes: `java.awt`, `java.io`, `java.math`, `java.net`, `java.nio`,
  `java.text`, `java.time`, `java.util`, `javax.swing`, and basic `java.lang`
  value types. Application classes are reached through `strange-eons/legacy`.
  Objects the library returns keep their public methods. `getClass`, reflection,
  `Thread`, and class loaders are not available. This keeps plug-ins on the
  supported API; it is not a security sandbox.
- **Bundled modules only.** `import "strange-eons/ui"` loads
  `strange-eons/ui.mjs` from the classpath of this plug-in, and those modules
  can import each other relatively. Other specifiers use the file system, so
  `import './util.mjs'` in a plug-in's own script still fails.

## Legacy script library

`strange-eons/legacy` ports SE's standard script libraries:

```js
import { ImageUtils, Settings, TypeGrid, textField } from "strange-eons/legacy";
```

`strange-eons/legacy/prefab` and `strange-eons/legacy/backwards-compatibility`
are imported separately. Exports such as `getPluginType` must be re-exported by
the plug-in for SE to find them.

Differences from the Rhino libraries:

- **Imports replace `useLibrary` and `require`.** Library functions are exports,
  not globals. `Packages`, `importClass`, and the `ca`, `arkham`, `swing`,
  `java`, and similar package names are gone; use `Java.type`.
- **No bean properties.** Call `field.getText()` and `field.setFont(f)`, not
  `field.text` and `field.font = f`.
- **Application classes are facades.** `Settings`, `DIY`, `Game`, and the like
  expose listed static members, including inherited ones such as `Color.BLACK`,
  and support `new` and `instanceof`, but are not Java classes:
  `Settings.class` is undefined. A facade cannot be subclassed,
  and `Java.extend` is not available.
- **Java strings are JS strings.** Use `===` and `.length`, not `.equals()` and
  `.length()`.
- **Fractional numbers do not convert to `int`.** Round them before calling Java.
- **No `$key`, `@key`, or `#key` syntax.** Use `$("key")`, `string("key")`, and
  `gstring("key")`. `settings.set("key", value)` replaces `$key = value`.
- **`Eons` is the `StrangeEons` class.** Static methods work: `Eons.getWindow()`.
  `Component`, `Editor`, and `sourcefile` are not defined.
- **`Bindings.getBindingClass`** takes a control, not a class.
- **`testDIYScript(gameCode, handlers)`** takes the DIY functions as an object,
  and `prefab(baseKey, hooks)` returns them. `testProjectScript` is removed.
- **`Error.warn` and `Error.deprecated`** do not report a script location.

Threads are limited, because one thread at a time can run script code in a
session. `Thread.busyWindow` always fails, as does `Thread.join` on a thread
started in the same call. A `Thread.run` task works only if no other script
code is running while it runs, so it cannot overlap the code that started it.

## Build

Requires JDK 25. The SPI resolves from the Central Portal snapshot repository:

```
./gradlew test          # unit tests against GraalJS on the classpath
./gradlew bundleTest    # loads the built .selibrary in an isolated classloader
./gradlew check         # both
./gradlew sePlugin      # build build/libs/GraalJSLanguage.selibrary
```

## Install

`./gradlew assemble` copies the bundle into the Strange Eons user plug-ins
folder if it exists (`~/.StrangeEons3/plug-ins`, `%APPDATA%\StrangeEons3\plug-ins`,
or `$STRANGE_EONS_USER_DIR/plug-ins`). Otherwise copy
`build/libs/GraalJSLanguage.selibrary` there by hand and restart SE.

## Launch options

GraalJS runs inside SE with no launch changes, but on JDK 25 the JVM prints
warnings, and two of them are about access that a future JDK will deny by
default. SE's launcher should pass:

| Option | Why | Without it |
|---|---|---|
| `--enable-native-access=ALL-UNNAMED` | Truffle calls `System.load` for its native support library ([JEP 472](https://openjdk.org/jeps/472)). | Warning today; a future JDK blocks the call and the engine fails to start. |
| `--sun-misc-unsafe-memory-access=allow` | Truffle uses `sun.misc.Unsafe` memory access ([JEP 498](https://openjdk.org/jeps/498)). | Warning today; the default moves to `deny` in a later JDK. |
| `-Dpolyglot.engine.WarnInterpreterOnly=false` | Silences Truffle's "fallback runtime" notice. | Cosmetic stderr warning on first use. |

These are the same options `./gradlew test` and `bundleTest` run with, and
both suites run warning-free with them.

`ALL-UNNAMED` is broad: it grants native access to everything on the class
path and in plug-in classloaders, not just Truffle. It is the only form that
works while SE and its plug-ins run in unnamed modules.

### Performance: interpreter only on stock JDKs

On OpenJDK or Oracle JDK 25, Truffle uses its fallback runtime: JavaScript is
interpreted and never JIT-compiled, so CPU-heavy scripts will be slower than
on Strange Rhino. No launch flag changes this. Per GraalVM's
[embedding guide](https://www.graalvm.org/latest/reference-manual/embed-languages/),
the optimizing runtime is available only:

- **On a GraalVM JDK 25** (Community or Oracle). SE would ship or launch on
  a GraalVM JDK instead of a stock one. Untested here: whether Truffle still
  picks the optimizing runtime when it is loaded from a plug-in
  classloader rather than the module path.
- **Through polyglot isolates** on a stock JDK: the engine runs in a separate
  Native Image isolate with its own JIT and GC. This needs platform-specific
  `js-isolate*` artifacts (`js-isolate-community` exists only from 25.1),
  so the plug-in would need one bundle per OS and architecture.

The engine logs `GraalJS <version> on <runtime> runtime` once at INFO;
`Interpreted` means the fallback runtime.

## Known issues

- **Bundle size.** The fat JAR carries Truffle, the JS language, regex
  engine and ICU4J; expect tens of MB. Excluding the optimizing-runtime jars
  would shrink it but rule out JIT permanently.
- **Version string.** `Engine.getVersion()` reports "Development Build"
  rather than 25.0.5 in this packaging.

## Publishing

The bundle is published only through the
[Strange Eons registry](https://github.com/strange-eons/strange-eons-registry),
not to Maven. CI keeps `GraalJSLanguage.selibrary` as a workflow artifact on
every build, building the script API from the default branch of
`strange-eons/strange-eons`.

To release, run `./gradlew release` on a clean, pushed `main`: it sets the
release version in `gradle.properties`, tags it (e.g. `1.0.0`) and bumps to the
next snapshot. Nothing is pushed; review, then `git push --follow-tags`. The
tag push attaches the bundle to a GitHub Release, and the registry picks it up
from the latest release.

## License

TBD. GraalJS is UPL-1.0 / MIT; the Groovy plug-in uses Apache-2.0; SE core
is MIT.
