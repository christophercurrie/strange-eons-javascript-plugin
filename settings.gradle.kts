rootProject.name = "strange-eons-javascript-plugin"

// The org.strangeeons.scripts SPI is not published to any repository yet, so
// it is built from a local Strange Eons checkout via a composite build.
// Override the location with -PstrangeEonsDir=/path/to/strange-eons or in
// ~/.gradle/gradle.properties. Default: a sibling directory.
val strangeEonsDir = file(
    providers.gradleProperty("strangeEonsDir").getOrElse("../strange-eons")
)

if (!strangeEonsDir.resolve("strange-eons-script-api").isDirectory) {
    throw GradleException(
        "Strange Eons checkout not found at $strangeEonsDir (needs the " +
            "strange-eons-script-api module). Clone " +
            "https://github.com/christophercurrie/strange-eons there, or pass " +
            "-PstrangeEonsDir=<path>."
    )
}

includeBuild(strangeEonsDir) {
    dependencySubstitution {
        substitute(module("org.strangeeons:strange-eons-script-api"))
            .using(project(":strange-eons-script-api"))
    }
}
