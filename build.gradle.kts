import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone

plugins {
    `java-library`
    id("com.gradleup.shadow") version "9.0.0"
}

group = "org.strangeeons.plugins"
version = "0.1.0-SNAPSHOT"
description = "Registers GraalJS (modern ECMAScript) as a scripting language with Strange Eons."

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

repositories {
    mavenCentral()
}

// GraalVM 25.0.x is the LTS line. GraalVM's documented coordinate is the
// POM-only aggregator org.graalvm.polyglot:js, which resolves to
// org.graalvm.js:js (also POM-only) -> js-language + truffle-runtime. Shadow
// tries to unzip POM artifacts, so depend on the two real jars directly.
val graalVersion = "25.0.5"

dependencies {
    // Provided by Strange Eons at runtime; resolved from the composite build.
    compileOnly("org.strangeeons:strange-eons-script-api")
    testImplementation("org.strangeeons:strange-eons-script-api")

    implementation("org.graalvm.polyglot:polyglot:$graalVersion")
    implementation("org.graalvm.js:js-language:$graalVersion")
    implementation("org.graalvm.truffle:truffle-runtime:$graalVersion")

    testImplementation(platform("org.junit:junit-bom:5.10.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
}

// Stamp the eons-plugin manifest's CATALOGUEID with a build-time timestamp.
// Format matches CatalogID.toDateString(): UTC, 0-based month, no padding.
// The UUID portion is preserved from the source file.
tasks.processResources {
    outputs.upToDateWhen { false }
    filesMatching("eons-plugin") {
        val cal = GregorianCalendar(TimeZone.getTimeZone("UTC"))
        val ts = listOf(
            Calendar.YEAR, Calendar.MONTH, Calendar.DAY_OF_MONTH,
            Calendar.HOUR_OF_DAY, Calendar.MINUTE, Calendar.SECOND, Calendar.MILLISECOND,
        ).joinToString("-") { cal.get(it).toString() }
        val pattern = Regex("""(CATALOGU?E?ID\{[-\da-fA-F]+:)\d+-\d+-\d+-\d+-\d+-\d+-\d+(\})""")
        filter { line -> pattern.replace(line) { "${it.groupValues[1]}$ts${it.groupValues[2]}" } }
    }
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

// Strange Eons consumes plug-in bundles as JARs renamed .selibrary. The fat
// JAR holds this plug-in plus GraalJS/Truffle, unrelocated: Truffle discovers
// languages and its runtime through META-INF/services, so service files must
// be merged and package names must not change.
tasks.jar {
    enabled = false
}

tasks.shadowJar {
    archiveBaseName = "GraalJSLanguage"
    archiveClassifier = ""
    archiveVersion = ""
    archiveExtension = "selibrary"
    mergeServiceFiles()
    // Polyglot/Truffle jars are multi-release; keep versioned entries live.
    manifest {
        attributes("Multi-Release" to "true")
    }
    // Module descriptors from the merged jars are meaningless in a fat JAR
    // and confuse tools that inspect it.
    exclude("module-info.class", "META-INF/versions/*/module-info.class")
}

// --- bundleTest: loads the built .selibrary the way Strange Eons does ------
// Runs against the shadow JAR in a fresh URLClassLoader whose parent sees
// only the script API, so it fails if shading broke Truffle's discovery.

val bundleTest by sourceSets.creating {
    java.srcDir("src/bundleTest/java")
}

dependencies {
    "bundleTestImplementation"("org.strangeeons:strange-eons-script-api")
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
    val bundle = tasks.shadowJar.flatMap { it.archiveFile }
    inputs.file(bundle)
    jvmArgumentProviders += CommandLineArgumentProvider {
        listOf("-Dgraaljs.bundle=${bundle.get().asFile.absolutePath}")
    }
    shouldRunAfter(tasks.test)
}

tasks.check {
    dependsOn(bundleTestTask)
}

// --- install into the local Strange Eons user folder -----------------------

val userPluginsDir = providers.provider {
    val override = System.getenv("STRANGE_EONS_USER_DIR")
    val base = when {
        override != null -> file(override)
        System.getProperty("os.name").startsWith("Windows") ->
            file("${System.getenv("APPDATA") ?: System.getProperty("user.home")}/StrangeEons3")
        else -> file("${System.getProperty("user.home")}/.StrangeEons3")
    }
    base.resolve("plug-ins")
}

val installPlugin = tasks.register<Copy>("installPlugin") {
    description = "Copies the built plug-in into the local Strange Eons user folder."
    group = "distribution"
    from(tasks.shadowJar)
    into(userPluginsDir)
    onlyIf { userPluginsDir.get().isDirectory }
}

tasks.assemble {
    dependsOn(tasks.shadowJar)
    finalizedBy(installPlugin)
}
