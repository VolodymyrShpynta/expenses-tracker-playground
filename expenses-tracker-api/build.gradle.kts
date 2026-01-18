plugins {
	alias(libs.plugins.kotlin.jvm)
	alias(libs.plugins.kotlin.spring)
	alias(libs.plugins.spring.boot)
	alias(libs.plugins.spring.dependency.management)
}

description = "Expenses Tracker API"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(libs.versions.java.get().toInt())
	}
}

dependencies {
	implementation(libs.spring.boot.starter.actuator)
	implementation(libs.spring.boot.starter.data.r2dbc)
	implementation(libs.spring.boot.starter.webflux)
	implementation(libs.reactor.kotlin.extensions)
	implementation(libs.kotlin.reflect)
	implementation(libs.kotlinx.coroutines.reactor)
	implementation(libs.jackson.module.kotlin)
	testImplementation(libs.spring.boot.starter.test)
	testImplementation(libs.kotlin.test.junit5)
	testImplementation(libs.kotlinx.coroutines.test)
	testImplementation(libs.r2dbc.h2)
	testRuntimeOnly(libs.junit.platform.launcher)
}

kotlin {
	compilerOptions {
		freeCompilerArgs.addAll("-Xjsr305=strict", "-Xannotation-default-target=param-property")
	}
}

tasks.withType<Test> {
	useJUnitPlatform()
}
