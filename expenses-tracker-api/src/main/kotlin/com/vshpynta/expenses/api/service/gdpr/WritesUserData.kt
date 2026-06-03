package com.vshpynta.expenses.api.service.gdpr

/**
 * Marks a service-interface method as write that must be gated by
 * [ProcessingRestrictionGuard].
 *
 * The annotation is purely declarative — the actual enforcement lives
 * in the corresponding `GdprAware*Service` decorator. The
 * `GdprDecoratorArchTest` is the safety net that asserts every
 * `@WritesUserData` method on a guarded interface is (a) overridden by
 * its decorator and (b) the decorator's override invokes
 * [ProcessingRestrictionGuard.requireWritesAllowed]. This catches the
 * silent-bypass failure mode where someone adds a new write method but
 * forgets to call the guard in the decorator override.
 *
 * Read-side methods on the same interfaces (e.g. exports,
 * `find*` queries) are intentionally **not** annotated — Art. 18(2)
 * allows the subject's own reads during a restriction.
 */
@Target(AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class WritesUserData
