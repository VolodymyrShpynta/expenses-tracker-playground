plugins {
    alias(libs.plugins.node)
}

description = "Expenses Tracker Frontend"

node {
    // Use the Node.js version already installed on the system
    download = false
}

tasks.npmInstall {
    inputs.file("package.json")
    inputs.file("package-lock.json")
}

val npmBuild = tasks.register<com.github.gradle.node.npm.task.NpmTask>("npmBuild") {
    group = "build"
    description = "Build the frontend application"
    dependsOn(tasks.npmInstall)
    npmCommand = listOf("run", "build")
    inputs.dir("src")
    inputs.dir("public")
    inputs.file("package.json")
    inputs.file("tsconfig.json")
    inputs.file("tsconfig.app.json")
    inputs.file("tsconfig.node.json")
    inputs.file("vite.config.ts")
    inputs.file("index.html")
    outputs.dir("dist")
}

val npmLint = tasks.register<com.github.gradle.node.npm.task.NpmTask>("npmLint") {
    group = "verification"
    description = "Lint the frontend source code"
    dependsOn(tasks.npmInstall)
    npmCommand = listOf("run", "lint")
    inputs.dir("src")
    inputs.file("eslint.config.js")
    inputs.file("tsconfig.json")
    inputs.file("tsconfig.app.json")
}

val npmTest = tasks.register<com.github.gradle.node.npm.task.NpmTask>("npmTest") {
    group = "verification"
    description = "Run frontend unit tests (vitest)"
    dependsOn(tasks.npmInstall)
    npmCommand = listOf("test", "--silent")
    inputs.dir("src")
    inputs.file("package.json")
    inputs.file("vite.config.ts")
    inputs.file("tsconfig.test.json")
    // Vitest writes no on-disk artefact; declare an upToDate marker so Gradle can cache.
    outputs.upToDateWhen { true }
}

tasks.register("build") {
    group = "build"
    description = "Build the frontend"
    dependsOn(npmBuild)
}

tasks.register("check") {
    group = "verification"
    description = "Run frontend checks"
    dependsOn(npmLint, npmTest)
}

tasks.register<Delete>("clean") {
    group = "build"
    description = "Clean frontend build outputs"
    delete("dist", "node_modules/.cache")
}
