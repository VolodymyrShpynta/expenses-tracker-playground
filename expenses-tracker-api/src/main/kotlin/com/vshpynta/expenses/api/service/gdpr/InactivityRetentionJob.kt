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
     * Spring 6.1+ runs `suspend` `@Scheduled` methods on the scheduled
     * task executor with the reactive bridge — no `runBlocking` needed.
     *
     * `SchedulerInvalidCronExpression` is suppressed because the IDE's
     * static analyzer eagerly resolves the placeholder chain
     * (`${app.gdpr.inactivity.cron}` → `${GDPR_INACTIVITY_CRON:0 0 3 * * *}`)
     * and then mis-parses the nested env-var default as a cron field.
     * Spring resolves both layers correctly at runtime.
     */
    @Suppress("SchedulerInvalidCronExpression")
    @Scheduled(cron = "\${app.gdpr.inactivity.cron}")
    suspend fun runTick() {
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
