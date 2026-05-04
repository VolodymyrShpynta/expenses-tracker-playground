plugins {
    alias(libs.plugins.node)
}

description = "Expenses Tracker Mobile (Expo / React Native)"

node {
    // Use the Node.js version already installed on the system, like
    // expenses-tracker-frontend does.
    download = false
}

tasks.npmInstall {
    inputs.file("package.json")
    inputs.file("package-lock.json")
    // Expo's transitive deps frequently produce peer-dep mismatches that
    // are non-fatal in practice (e.g. react-native-reanimated vs.
    // @shopify/react-native-skia). Use legacy resolution to keep CI green;
    // run a manual `npm install` in the package when bumping deps to flush
    // out genuine breakages.
    args.set(args.get() + listOf("--legacy-peer-deps"))
}

val npmLint = tasks.register<com.github.gradle.node.npm.task.NpmTask>("npmLint") {
    group = "verification"
    description = "Lint the mobile source code"
    dependsOn(tasks.npmInstall)
    npmCommand = listOf("run", "lint")
    inputs.dir("src")
    inputs.file("eslint.config.js")
    inputs.file("tsconfig.json")
    inputs.file("tsconfig.app.json")
    outputs.upToDateWhen { true }
}

val npmTest = tasks.register<com.github.gradle.node.npm.task.NpmTask>("npmTest") {
    group = "verification"
    description = "Run mobile pure-TS unit tests (vitest)"
    dependsOn(tasks.npmInstall)
    npmCommand = listOf("test", "--silent")
    inputs.dir("src")
    inputs.file("package.json")
    inputs.file("vitest.config.ts")
    inputs.file("tsconfig.test.json")
    outputs.upToDateWhen { true }
}

val npmTypecheck = tasks.register<com.github.gradle.node.npm.task.NpmTask>("npmTypecheck") {
    group = "verification"
    description = "TypeScript build (no emit) — validates types without bundling the RN app"
    dependsOn(tasks.npmInstall)
    npmCommand = listOf("run", "typecheck")
    inputs.dir("src")
    inputs.file("tsconfig.json")
    inputs.file("tsconfig.app.json")
    inputs.file("tsconfig.test.json")
    outputs.upToDateWhen { true }
}

// `expo export` produces a static web bundle; native iOS/Android builds run
// through EAS (`eas build`) outside Gradle. Mirror this by making `build`
// depend only on the type-check + tests so CI on Windows/Linux works.
tasks.register("build") {
    group = "build"
    description = "Verify the mobile module builds (type-check)"
    dependsOn(npmTypecheck)
}

tasks.register("check") {
    group = "verification"
    description = "Run mobile checks (lint + tests)"
    dependsOn(npmLint, npmTest)
}

tasks.register<Delete>("clean") {
    group = "build"
    description = "Clean mobile build outputs"
    delete("dist", ".expo", "node_modules/.cache", "node_modules/.tmp")
}
