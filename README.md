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

Pre-release. Depends on the unreleased script-language SPI in
[christophercurrie/strange-eons](https://github.com/christophercurrie/strange-eons)
(module `strange-eons-script-api`).

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

- **No SE script library.** `useLibrary`, `Eons`, `Editor`, `sprintf`,
  the `$`/`@`/`#` settings syntax and everything else in SE's Rhino
  `libraries/` are Rhino-specific and are not loaded. Scripts use Java
  interop (`Java.type`) directly.
- **No `import` of sibling files.** Module specifiers are resolved against
  the file system, not the bundle, so `import './util.mjs'` inside a bundle
  fails. Needs a Truffle `FileSystem` that reads bundle resources.
- **Host classes come from this plug-in's classloader chain** (the plug-in
  bundle → SE library tier → application). Classes in other plug-ins'
  isolated bundles are not visible to `Java.type`.

## Build

Requires JDK 25 and a checkout of `christophercurrie/strange-eons` that
contains `strange-eons-script-api`. The SPI is not published to any
repository; it is built from that checkout through a Gradle composite build.
By default the checkout is expected at `../strange-eons`:

```
./gradlew test          # unit tests against GraalJS on the classpath
./gradlew bundleTest    # loads the built .selibrary in an isolated classloader
./gradlew check         # both
./gradlew sePlugin      # build build/libs/GraalJSLanguage.selibrary
```

Point at a different checkout with `-PstrangeEonsDir=/path/to/strange-eons`
or set `strangeEonsDir` in `~/.gradle/gradle.properties`.

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

## License

TBD. GraalJS is UPL-1.0 / MIT; the Groovy plug-in uses Apache-2.0; SE core
is MIT.
