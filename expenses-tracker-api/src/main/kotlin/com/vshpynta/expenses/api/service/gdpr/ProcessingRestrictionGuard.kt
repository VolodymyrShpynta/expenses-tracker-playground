package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import com.vshpynta.expenses.api.service.auth.UserContextService
import org.springframework.stereotype.Service

/**
 * Single entry point for "may this user perform a write right now?".
 *
 * Called from the `GdprAware*Service` decorators
 * ([GdprAwareExpenseCommandService], [GdprAwareCategoryService],
 * [GdprAwareDataExchangeService]) on every write to the corresponding
 * business service. The business `Default*` impls have no knowledge of
 * GDPR — restriction enforcement is the decorators' sole
 * responsibility, isolating the cross-cutting concern from business
 * logic. The decorators are wired as `@Primary` beans so controllers
 * receive them transparently when they inject the service interface.
 *
 * Reading is allowed during Art. 18 restriction (the subject's own
 * access is one of the explicit Art. 18(2) carve-outs), so the
 * decorators only call this guard on write methods marked with
 * [WritesUserData] on the interface; the `GdprDecoratorArchTest` is
 * the safety net that enforces this contract.
 *
 * The guard is implemented as an explicit method call rather than a
 * Spring AOP aspect because reactive + `suspend fun` + Spring AOP have
 * brittle interactions in WebFlux; explicit calls from the decorators
 * are robust and straightforward to test.
 *
 * **Performance note.** Internal callers within the service layer that
 * loop over the command surface (`DataImporter`,
 * `DefaultCategoryService.mergeInto`) inject the `Default*` impls via
 * `@Qualifier` rather than the `@Primary` decorator, to avoid one
 * redundant `processing_restrictions` PK lookup per iteration. The
 * outer entry from the controller has already been guarded once, so
 * the contract is preserved.
 */
@Service
class ProcessingRestrictionGuard(
    private val restrictions: ProcessingRestrictionRepository,
    private val userContextService: UserContextService,
) {

    /**
     * Throws [ProcessingRestrictedException] when the current user is
     * restricted. Returns normally (and cheaply — single PK lookup)
     * when they are not.
     */
    suspend fun requireWritesAllowed() {
        val userId = userContextService.currentUserId()
        requireWritesAllowed(userId)
    }

    /**
     * Variant for code that already knows the user id (e.g. the
     * inactivity job uses this against arbitrary `user_id`s, not the
     * caller's own).
     */
    suspend fun requireWritesAllowed(userId: String) {
        val restriction = restrictions.findByUserId(userId) ?: return
        throw ProcessingRestrictedException(userId, restriction.ground)
    }
}
