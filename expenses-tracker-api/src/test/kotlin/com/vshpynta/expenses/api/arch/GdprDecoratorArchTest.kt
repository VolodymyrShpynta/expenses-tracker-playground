package com.vshpynta.expenses.api.arch

import com.tngtech.archunit.core.domain.JavaClass
import com.tngtech.archunit.core.domain.JavaMethod
import com.tngtech.archunit.core.domain.JavaMethodCall
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import com.vshpynta.expenses.api.service.gdpr.ProcessingRestrictionGuard
import com.vshpynta.expenses.api.service.gdpr.WritesUserData
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/**
 * Architectural safety net for the GDPR decorator layer.
 *
 * Two invariants are checked:
 *
 *   1. **SRP — business impls don't depend on the guard.** `Default*`
 *      service classes in `service.*` must not reference
 *      [ProcessingRestrictionGuard]. GDPR enforcement is the
 *      decorators' sole responsibility.
 *
 *   2. **Decorator completeness — no silent bypass.** For every
 *      service interface method annotated with [WritesUserData], the
 *      corresponding `GdprAware*Service` decorator must (a) override
 *      it and (b) the override's bytecode must invoke
 *      [ProcessingRestrictionGuard.requireWritesAllowed]. This catches
 *      the failure mode where a new write method is added to a guarded
 *      interface but the decorator override forgets to call the guard
 *      — which the compiler cannot catch.
 *
 * The decorator name is derived by convention: for an interface
 * `Xyz`, the decorator is `service.gdpr.GdprAwareXyz`. Adding a new
 * guarded interface only requires that the decorator follow this
 * naming and live in `service.gdpr`.
 */
class GdprDecoratorArchTest {

    private val classes = ClassFileImporter()
        .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
        .importPackages("com.vshpynta.expenses.api")

    @Test
    fun `business Default service classes must not depend on ProcessingRestrictionGuard`() {
        noClasses()
            .that().haveSimpleNameStartingWith("Default")
            .and().haveSimpleNameEndingWith("Service")
            .and().resideInAPackage("com.vshpynta.expenses.api.service..")
            .and().resideOutsideOfPackage("com.vshpynta.expenses.api.service.gdpr..")
            .should().dependOnClassesThat().areAssignableTo(ProcessingRestrictionGuard::class.java)
            .because(
                "Default* service classes must not depend on ProcessingRestrictionGuard. " +
                    "GDPR enforcement is the responsibility of the GdprAware* decorator (SRP)."
            )
            .check(classes)
    }

    @Test
    fun `every WritesUserData interface method must be overridden by its GdprAware decorator and invoke the guard`() {
        // Given
        val guardedInterfaces = findGuardedInterfaces()
        assertThat(guardedInterfaces)
            .describedAs("Test wiring sanity check: expected at least one @WritesUserData-annotated interface")
            .isNotEmpty

        // When
        val violations = guardedInterfaces.flatMap { iface -> violationsFor(iface) }

        // Then
        assertThat(violations)
            .describedAs(
                "Decorator completeness violation — every @WritesUserData interface method " +
                    "must be overridden by its GdprAware* decorator and the override must invoke " +
                    "ProcessingRestrictionGuard.requireWritesAllowed. " +
                    "This catches the silent-bypass failure mode where a new write method " +
                    "gets through the decorator without a guard check."
            )
            .isEmpty()
    }

    /** Interfaces in the imported classpath that have at least one [WritesUserData] method. */
    private fun findGuardedInterfaces(): List<JavaClass> =
        classes
            .filter { it.isInterface }
            .filter { iface -> iface.methods.any { it.isAnnotatedWith(WritesUserData::class.java) } }

    /**
     * All structural violations for one guarded interface — missing
     * decorator, wrong inheritance, missing override, or missing guard
     * call. Returns an empty list when the decorator is well-formed.
     */
    private fun violationsFor(iface: JavaClass): List<String> {
        val decoratorName = "com.vshpynta.expenses.api.service.gdpr.GdprAware${iface.simpleName}"
        val decorator = classes.firstOrNull { it.fullName == decoratorName }
            ?: return listOf("Interface ${iface.simpleName} has @WritesUserData methods but no decorator found at $decoratorName")

        if (!decorator.allRawInterfaces.any { it.fullName == iface.fullName }) {
            return listOf("${decorator.simpleName} does not implement ${iface.simpleName}")
        }

        return iface.methods
            .filter { it.isAnnotatedWith(WritesUserData::class.java) }
            .mapNotNull { ifaceMethod -> violationFor(decorator, iface, ifaceMethod) }
    }

    /**
     * One violation string for one `@WritesUserData` interface method,
     * or `null` if the decorator overrides it correctly and the
     * override (or its suspend-state-machine siblings) calls the guard.
     */
    private fun violationFor(
        decorator: JavaClass,
        iface: JavaClass,
        ifaceMethod: JavaMethod,
    ): String? {
        val override = findOverride(decorator, ifaceMethod)
            ?: return "${decorator.simpleName} is missing override of " +
                "@WritesUserData method ${iface.simpleName}.${signatureOf(ifaceMethod)}"

        if (!overrideInvokesGuard(decorator, ifaceMethod)) {
            return "${decorator.simpleName}.${override.name} overrides a @WritesUserData method " +
                "but does not invoke ProcessingRestrictionGuard.requireWritesAllowed"
        }
        return null
    }

    /** Match by name + raw parameter types (works for both plain and `suspend` methods). */
    private fun findOverride(decorator: JavaClass, ifaceMethod: JavaMethod): JavaMethod? =
        decorator.methods.firstOrNull {
            it.name == ifaceMethod.name &&
                it.rawParameterTypes.map { p -> p.fullName } ==
                ifaceMethod.rawParameterTypes.map { p -> p.fullName }
        }

    /**
     * Whether the decorator's override of [ifaceMethod] (or any of its
     * synthetic siblings) invokes [ProcessingRestrictionGuard.requireWritesAllowed].
     *
     * Kotlin `suspend` functions are compiled into the public method
     * PLUS one or more synthetic siblings (`name$suspendImpl`,
     * `name$default`, ...) that carry the actual state-machine body.
     * ArchUnit's `methodCallsFromSelf` only sees calls from the method
     * it is invoked on, so we scan the override AND every synthetic
     * sibling sharing the same name prefix.
     */
    private fun overrideInvokesGuard(decorator: JavaClass, ifaceMethod: JavaMethod): Boolean {
        val related = decorator.methods.filter {
            it.name == ifaceMethod.name || it.name.startsWith("${ifaceMethod.name}$")
        }
        return related.any { m -> m.methodCallsFromSelf.any(::isGuardCall) }
    }

    private fun isGuardCall(call: JavaMethodCall): Boolean =
        call.targetOwner.fullName == ProcessingRestrictionGuard::class.java.name &&
            call.target.name == "requireWritesAllowed"

    private fun signatureOf(method: JavaMethod): String =
        "${method.name}(${method.rawParameterTypes.joinToString(", ") { it.simpleName }})"
}
