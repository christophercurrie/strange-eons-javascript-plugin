plugins {
    `java-library`
    id("org.strangeeons.plugin") version "1.0.0"
    id("net.researchgate.release") version "3.2.0"
}

group = "org.strangeeons.plugins"
description = "Registers modern ECMAScript as a scripting language with Strange Eons."

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
    maven("https://central.sonatype.com/repository/maven-snapshots/") {
        mavenContent { snapshotsOnly() }
        content { includeGroup("org.strangeeons") }
    }
}

// GraalVM 25.0.x is the LTS line. GraalVM's documented coordinate is the
// POM-only aggregator org.graalvm.polyglot:js, which resolves to
// org.graalvm.js:js (also POM-only) -> js-language + truffle-runtime. Shadow
// tries to unzip POM artifacts, so depend on the two real jars directly.
val graalVersion = "25.0.5"
val scriptApiVersion = "3.6.0-SNAPSHOT"

dependencies {
    // Provided by Strange Eons at runtime.
    compileOnly("org.strangeeons:strange-eons-script-api:$scriptApiVersion")
    testImplementation("org.strangeeons:strange-eons-script-api:$scriptApiVersion")

    implementation("org.graalvm.polyglot:polyglot:$graalVersion")
    implementation("org.graalvm.js:js-language:$graalVersion")
    implementation("org.graalvm.truffle:truffle-runtime:$graalVersion")

    testImplementation(platform("org.junit:junit-bom:5.10.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

release {
    git {
        // Review the release commits and tag, then push with --follow-tags.
        pushToRemote = false
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
}

// JVM options Strange Eons needs at launch to host GraalJS on JDK 25
// without warnings; tests use the same set. See README "Launch options".
val graalHostJvmArgs = listOf(
    // Truffle loads its native support library (JEP 472).
    "--enable-native-access=ALL-UNNAMED",
    // Truffle uses sun.misc.Unsafe memory access (JEP 498).
    "--sun-misc-unsafe-memory-access=allow",
    // Fallback runtime is expected on stock JDKs.
    "-Dpolyglot.engine.WarnInterpreterOnly=false",
)

tasks.withType<Test>().configureEach {
    jvmArgs(graalHostJvmArgs)
}

tasks.test {
    useJUnitPlatform()
}

// The bundle holds this plug-in plus GraalJS/Truffle, unrelocated: Truffle
// discovers languages and its runtime through META-INF/services, so package
// names must not change.
strangeEonsPlugin {
    bundleName = "ECMAScriptLanguage"
}

tasks.sePlugin {
    // Polyglot/Truffle jars are multi-release; keep versioned entries live.
    manifest {
        attributes("Multi-Release" to "true")
    }
}

// --- bundleTest: loads the built .selibrary the way Strange Eons does ------
// Runs against the shadow JAR in a fresh URLClassLoader whose parent sees
// only the script API, so it fails if shading broke Truffle's discovery.

val bundleTest by sourceSets.creating {
    java.srcDir("src/bundleTest/java")
}

dependencies {
    "bundleTestImplementation"("org.strangeeons:strange-eons-script-api:$scriptApiVersion")
    "bundleTestImplementation"(platform("org.junit:junit-bom:5.10.2"))
    "bundleTestImplementation"("org.junit.jupiter:junit-jupiter")
    "bundleTestRuntimeOnly"("org.junit.platform:junit-platform-launcher")
}

val bundleTestTask = tasks.register<Test>("bundleTest") {
    description = "Smoke-tests the packaged .selibrary in an isolated classloader."
    group = "verification"
    testClassesDirs = bundleTest.output.classesDirs
    classpath = bundleTest.runtimeClasspath
    useJUnitPlatform()
    val bundle = tasks.sePlugin.flatMap { it.archiveFile }
    inputs.file(bundle)
    jvmArgumentProviders += CommandLineArgumentProvider {
        listOf("-Dgraaljs.bundle=${bundle.get().asFile.absolutePath}")
    }
    shouldRunAfter(tasks.test)
}

tasks.check {
    dependsOn(bundleTestTask)
}

tasks.assemble {
    finalizedBy(tasks.installPlugin)
}
