package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.gdpr.GdprProperties
import com.vshpynta.expenses.api.model.gdpr.ErasureRequester
import com.vshpynta.expenses.api.repository.gdpr.AccountActivityRepository
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.count
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.toSet
import kotlinx.coroutines.runBlocking
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import java.time.Clock

/**
 * Implements the Art. 5(e) retention trigger for inactive accounts. On
 * every tick (default 03:00 UTC daily) it:
 *
 *  1. Finds accounts inactive for [GdprProperties.Inactivity.warningAfter]
 *     that have not yet received a warning. Sends the warning email and
 *     stamps `inactivity_warning_sent_at`.
 *  2. Finds accounts where the warning was sent more than
 *     [GdprProperties.Inactivity.erasureGrace] ago and the user still
 *     hasn't returned (`last_seen_at <= warning_sent_at`). Erases them
 *     via [GdprErasureService].
 *
 * Skips users with an active Art. 18 restriction — preserving data for
 * a legal claim is the entire point of restriction grounds (b)/(c), and
 * auto-erasing such an account during litigation would be a serious
 * compliance failure.
 *
 * Disabled by default (`app.gdpr.inactivity.enabled = false`). Turn on
 * only when the email transport is real.
 */
@Service
@ConditionalOnProperty(prefix = "app.gdpr.inactivity", name = ["enabled"], havingValue = "true")
class InactivityRetentionJob(
    private val activityRepository: AccountActivityRepository,
    private val restrictionRepository: ProcessingRestrictionRepository,
    private val erasureService: GdprErasureService,
    private val notifier: UserNotificationService,
    private val properties: GdprProperties,
    private val clock: Clock,
) {

    companion object {
        private val logger = LoggerFactory.getLogger(InactivityRetentionJob::class.java)
        private const val SYSTEM_ACTOR = "system:inactivity-retention-job"
    }

    /**
     * Cron expression is read directly from configuration via property
     * placeholder. Disabled-by-default master switch is enforced by
     * [ConditionalOnProperty] above so the bean isn't even constructed
     * when `app.gdpr.inactivity.enabled = false`.
     *
     * **Why not `suspend fun`?** ShedLock's `@SchedulerLock` works via
     * a Spring AOP interceptor that conceptually does:
     * ```
     * lockProvider.lock(...)
     * try { invocation.proceed() }
     * finally { lock.release() }
     * ```
     * For a `suspend fun`, the Kotlin compiler rewrites the method
     * to take a `Continuation` and the bytecode returns
     * `COROUTINE_SUSPENDED` the instant the body hits its first real
     * suspension point (e.g. R2DBC I/O). The actual work then
     * continues asynchronously on whatever dispatcher the coroutine
     * resumes on. From AOP's point of view `proceed()` has already
     * returned, so the `finally` block runs and the lock is released
     * *before* the real work executes — defeating the lock entirely:
     * a second replica can now acquire the lock and run the same
     * tick in parallel.
     *
     * Wrapping the body in `runBlocking { ... }` turns `runTick` back
     * into a regular blocking method as observed by the AOP
     * interceptor: the scheduling thread parks inside `runBlocking`
     * and `proceed()` does not return until every suspension point
     * in the coroutine has completed. The `try`/`finally` lock
     * window therefore covers the full duration of the work.
     *
     * Note this is *not* about preventing the coroutine from
     * switching dispatchers — coroutines inside `runBlocking { ... }`
     * still suspend and resume freely (e.g. on the Reactor Netty
     * event loop for R2DBC calls). What `runBlocking` guarantees is
     * that the *caller thread* (the Spring scheduler's thread that
     * AOP wrapped) stays inside the `runTick()` stack frame until
     * the suspending body has finished.
     *
     * **Distributed-lock semantics.** `@SchedulerLock` guarantees that
     * across all replicas, at most one instance runs this tick per
     * cron fire. Other instances try to acquire the lock, find it
     * held, and skip silently. `lockAtMostFor = PT15M` is the safety
     * release if this JVM dies mid-tick (a different replica picks
     * up the next fire after that window). `lockAtLeastFor = PT0S`
     * means the lock is released the moment the job completes — fine
     * for a once-a-day cron where clock skew between replicas would
     * have to be measured in *hours* to cause a duplicate run.
     *
     * `SchedulerInvalidCronExpression` is suppressed because the IDE's
     * static analyzer eagerly resolves the placeholder chain
     * (`${app.gdpr.inactivity.cron}` → `${GDPR_INACTIVITY_CRON:0 0 3 * * *}`)
     * and then mis-parses the nested env-var default as a cron field.
     * Spring resolves both layers correctly at runtime.
     */
    @Suppress("SchedulerInvalidCronExpression")
    @Scheduled(cron = "\${app.gdpr.inactivity.cron}")
    @SchedulerLock(
        name = "gdpr-inactivity-tick",
        lockAtMostFor = "PT15M",
        lockAtLeastFor = "PT0S",
    )
    fun runTick() {
        runBlocking {
            try {
                val restrictedUsers = restrictionRepository.findAllRestrictedUserIds().toSet()
                runWarningStep(restrictedUsers)
                runErasureStep(restrictedUsers)
            } catch (ce: CancellationException) {
                throw ce
            } catch (t: Throwable) {
                logger.error("Inactivity retention tick failed", t)
            }
        }
    }

    private suspend fun runWarningStep(restrictedUsers: Set<String>) {
        val inactiveBefore = clock.instant().minus(properties.inactivity.warningAfter)
        val candidates = activityRepository.findCandidatesForWarning(inactiveBefore)
        val now = clock.instant()
        val graceDays = properties.inactivity.erasureGrace.toDays()
        val warned = candidates
            .filter { activity ->
                val restricted = activity.userId in restrictedUsers
                if (restricted) {
                    logger.debug("Skipping warning for restricted user {}", activity.userId)
                }
                !restricted
            }
            .onEach { activity ->
                notifier.sendInactivityWarning(activity.userId, graceDays)
                activityRepository.stampWarningSent(activity.userId, now)
            }
            .count()
        if (warned > 0) {
            logger.info("Inactivity warnings sent: {}", warned)
        }
    }

    private suspend fun runErasureStep(restrictedUsers: Set<String>) {
        val graceCutoff = clock.instant().minus(properties.inactivity.erasureGrace)
        val candidates = activityRepository.findCandidatesForErasure(graceCutoff)
        val summary = inactivitySummary()
        val erased = candidates
            .filter { activity ->
                val restricted = activity.userId in restrictedUsers
                if (restricted) {
                    logger.debug("Skipping inactivity erasure for restricted user {}", activity.userId)
                }
                !restricted
            }
            .onEach { activity ->
                erasureService.eraseUser(
                    userId = activity.userId,
                    requestedBy = ErasureRequester.INACTIVITY_JOB,
                    actorId = SYSTEM_ACTOR,
                    reasonNote = summary,
                )
            }
            .count()
        if (erased > 0) {
            logger.info("Inactivity erasures completed: {}", erased)
        }
    }

    private fun inactivitySummary(): String =
        "Inactive account erased after ${properties.inactivity.warningAfter.toDays()} " +
            "days of inactivity + ${properties.inactivity.erasureGrace.toDays()} day grace"
}
