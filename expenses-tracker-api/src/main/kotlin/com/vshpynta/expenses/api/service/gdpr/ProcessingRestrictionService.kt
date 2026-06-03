package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.gdpr.GdprProperties
import com.vshpynta.expenses.api.model.gdpr.ProcessingRestriction
import com.vshpynta.expenses.api.model.gdpr.ProcessingRestrictionLogEntry
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.model.gdpr.RestrictionLogEvent
import com.vshpynta.expenses.api.model.gdpr.RestrictionRequester
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionLogRepository
import com.vshpynta.expenses.api.repository.gdpr.ProcessingRestrictionRepository
import com.vshpynta.expenses.api.util.IdentifierHasher
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant

/**
 * Owns the lifecycle of Art. 18 processing restrictions: apply,
 * pre-lift notice, lift. Each transition writes both the live state and
 * an append-only audit row inside the same transaction.
 *
 * The two-step lift (notice → dwell → actual lift) is what makes the
 * Art. 18(3) notification duty mechanically enforceable rather than a
 * checkbox.
 */
@Service
class ProcessingRestrictionService(
    private val restrictions: ProcessingRestrictionRepository,
    private val log: ProcessingRestrictionLogRepository,
    private val notifier: UserNotificationService,
    private val hasher: IdentifierHasher,
    private val clock: Clock,
    private val properties: GdprProperties,
) {

    companion object {
        private val logger = LoggerFactory.getLogger(ProcessingRestrictionService::class.java)
    }

    suspend fun findRestriction(userId: String): ProcessingRestriction? =
        restrictions.findByUserId(userId)

    /**
     * Apply a restriction. Rejects with [RestrictionStateConflictException]
     * if one is already active — re-applying would lose audit fidelity
     * (the existing `restricted_at` and `ground` would be silently
     * superseded). The caller must lift first if they need to change
     * the ground.
     */
    @Transactional
    suspend fun restrict(
        userId: String,
        ground: RestrictionGround,
        requestedBy: RestrictionRequester,
        actorId: String,
        reasonNote: String?,
    ): ProcessingRestriction {
        if (restrictions.existsByUserId(userId)) {
            throw RestrictionStateConflictException(
                "Processing restriction is already active for user $userId"
            )
        }
        val now = clock.instant()
        val restriction = ProcessingRestriction(
            userId = userId,
            restrictedAt = now,
            ground = ground,
            requestedBy = requestedBy,
            actorId = actorId,
            reasonNote = reasonNote,
        )
        restrictions.insert(restriction)
        log.save(
            ProcessingRestrictionLogEntry(
                userIdHash = hasher.hash(userId),
                event = RestrictionLogEvent.RESTRICTED,
                ground = ground,
                requestedBy = requestedBy,
                actorIdHash = hasher.hash(actorId),
                reasonNote = reasonNote,
            )
        )
        logger.info("Restriction applied for user {} ({}, by {})", userId, ground, requestedBy)
        return restriction
    }

    /**
     * Send the Art. 18(3) pre-lift notice. Re-calling after the notice
     * was already sent is a conflict (the caller should proceed
     * straight to [lift]). Returns the stamped notice timestamp so the
     * caller does not need to re-read the row to obtain it.
     */
    @Transactional
    suspend fun sendPreLiftNotice(
        userId: String,
        requestedBy: RestrictionRequester,
        actorId: String,
    ): Instant {
        val existing = restrictions.findByUserId(userId)
            ?: throw RestrictionStateConflictException(
                "No active restriction to lift for user $userId"
            )
        if (existing.liftNoticeSentAt != null) {
            throw RestrictionStateConflictException(
                "Pre-lift notice has already been sent for user $userId at ${existing.liftNoticeSentAt}"
            )
        }
        return doSendPreLiftNotice(existing, requestedBy, actorId)
    }

    /**
     * Final lift. Requires (a) an active restriction, (b) the pre-lift
     * notice to have been sent, and (c) the dwell window to have elapsed.
     */
    @Transactional
    suspend fun lift(userId: String, requestedBy: RestrictionRequester, actorId: String) {
        val existing = restrictions.findByUserId(userId)
            ?: throw RestrictionStateConflictException(
                "No active restriction to lift for user $userId"
            )
        doLift(existing, requestedBy, actorId)
    }

    /**
     * When [noticeSentAt] is non-null, returns the earliest instant at
     * which [lift] will succeed.
     */
    fun liftAvailableAt(noticeSentAt: Instant): Instant =
        noticeSentAt.plus(properties.restriction.liftDwell)

    /**
     * Single entry point for the two-step lift flow. Encapsulates the
     * "what happens on each call?" decision so both the subject and
     * admin controllers can collapse to a trivial `when` over the
     * returned [LiftOutcome]:
     *
     *   * no active restriction              → [LiftOutcome.NothingToLift]
     *   * active, notice not yet sent        → [LiftOutcome.NoticeSent]
     *     (sends the Art. 18(3) pre-lift notice and stamps the row)
     *   * active, notice already sent        → [LiftOutcome.Lifted]
     *     (performs the actual lift; may throw
     *     [RestrictionLiftPreconditionException] if the dwell window
     *     has not yet elapsed)
     *
     * `@Transactional` is declared on this *outer* method so the
     * Spring proxy opens the transaction when a controller calls in.
     * The real work is in the private [doSendPreLiftNotice] /
     * [doLift] helpers — calling those rather than the public
     * `@Transactional` methods avoids Spring's self-invocation pitfall
     * (where a `this.x()` call bypasses the proxy and any nested
     * `@Transactional` annotation is silently ignored). The helpers
     * also take the already-loaded [ProcessingRestriction] so we hit
     * the DB once per call.
     */
    @Transactional
    suspend fun requestLift(
        userId: String,
        requestedBy: RestrictionRequester,
        actorId: String,
    ): LiftOutcome {
        val existing = restrictions.findByUserId(userId) ?: return LiftOutcome.NothingToLift
        return if (existing.liftNoticeSentAt == null) {
            val noticeSentAt = doSendPreLiftNotice(existing, requestedBy, actorId)
            LiftOutcome.NoticeSent(
                liftNoticeSentAt = noticeSentAt,
                liftAvailableAt = liftAvailableAt(noticeSentAt),
            )
        } else {
            doLift(existing, requestedBy, actorId)
            LiftOutcome.Lifted
        }
    }

    /**
     * Assumes [existing] has `liftNoticeSentAt == null` (callers validate).
     *
     * **Ordering note — notifier inside the transaction (intentional).**
     * The pre-lift notice send happens *inside* the `@Transactional`
     * boundary opened by the public entry point. If the notifier throws,
     * Spring rolls back the `stampLiftNotice` + audit write, leaving the
     * restriction in "notice not sent" state so the caller can safely
     * retry. For an Art. 18(3) compliance notice that is the right
     * trade-off: an unsent notice is a compliance miss, while a
     * duplicate notice (if a rollback happens *after* a successful
     * send) is harmless.
     *
     * Alternatives that were considered and rejected for now:
     *
     *  * `@TransactionalEventListener(AFTER_COMMIT)` — moves the send
     *    outside the txn, eliminating duplicates but introducing the
     *    opposite failure mode (DB committed, email never sent).
     *    Strictly worse for compliance notices.
     *  * **Transactional outbox.** Inside the txn, insert into an
     *    `outbox_notifications` table; a separate dispatcher drains it
     *    with `SELECT … FOR UPDATE SKIP LOCKED` and sends the email.
     *    Survives crashes between commit and send; needs *something*
     *    to wake the dispatcher.
     *      - Pure polling (every few seconds) is the simplest form —
     *        boring, reliable, no new infrastructure.
     *      - PostgreSQL `LISTEN` / `NOTIFY` (R2DBC supports it via
     *        `PostgresqlConnection.notifications`) avoids the polling
     *        pressure: the txn issues `NOTIFY`, the listener wakes up
     *        and drains. A low-frequency poll is still kept as a
     *        safety net because `NOTIFY` delivery is best-effort.
     *      - A real broker (Kafka / RabbitMQ / SQS) does **not**
     *        replace the outbox — a raw Kafka producer cannot make
     *        "DB write + publish" atomic. The outbox stays; only the
     *        dispatcher's downstream sink changes.
     *
     * The outbox is the right shape once we wire a real email
     * transport (see `TODO(gdpr-email)` markers in
     * [UserNotificationService]); until then, synchronous send inside
     * the txn keeps the compliance semantics correct with zero extra
     * moving parts.
     */
    private suspend fun doSendPreLiftNotice(
        existing: ProcessingRestriction,
        requestedBy: RestrictionRequester,
        actorId: String,
    ): Instant {
        val userId = existing.userId
        val now = clock.instant()
        restrictions.stampLiftNotice(userId, now)
        log.save(
            ProcessingRestrictionLogEntry(
                userIdHash = hasher.hash(userId),
                event = RestrictionLogEvent.LIFT_NOTICE_SENT,
                ground = existing.ground,
                requestedBy = requestedBy,
                actorIdHash = hasher.hash(actorId),
            )
        )
        notifier.sendPreLiftNotice(userId, properties.restriction.liftDwell)
        logger.info("Pre-lift notice sent for user {} (dwell {})", userId, properties.restriction.liftDwell)
        return now
    }

    /**
     * Validates the Art. 18(3) preconditions on the supplied [existing]
     * row, then performs the lift. Callers are responsible for proving
     * `existing` is the current live state.
     */
    private suspend fun doLift(
        existing: ProcessingRestriction,
        requestedBy: RestrictionRequester,
        actorId: String,
    ) {
        val userId = existing.userId
        val noticeSentAt = existing.liftNoticeSentAt
            ?: throw RestrictionLiftPreconditionException(
                "Cannot lift restriction for user $userId — Art. 18(3) pre-lift notice has not been sent"
            )
        val now = clock.instant()
        val availableAt = noticeSentAt.plus(properties.restriction.liftDwell)
        if (now.isBefore(availableAt)) {
            throw RestrictionLiftPreconditionException(
                "Cannot lift restriction for user $userId until $availableAt " +
                    "(notice sent at $noticeSentAt, dwell ${properties.restriction.liftDwell})"
            )
        }
        restrictions.deleteByUserId(userId)
        log.save(
            ProcessingRestrictionLogEntry(
                userIdHash = hasher.hash(userId),
                event = RestrictionLogEvent.UNRESTRICTED,
                ground = existing.ground,
                requestedBy = requestedBy,
                actorIdHash = hasher.hash(actorId),
            )
        )
        logger.info("Restriction lifted for user {} (by {})", userId, requestedBy)
    }
}

/**
 * Tri-state result of [ProcessingRestrictionService.requestLift]. Maps
 * directly to HTTP — 204 / 202 / 204 respectively — without leaking
 * the restriction lifecycle into the controllers.
 */
sealed interface LiftOutcome {
    /** The user has no active restriction; nothing to do. */
    data object NothingToLift : LiftOutcome

    /** First call of the two-step flow — the Art. 18(3) notice has just been recorded. */
    data class NoticeSent(val liftNoticeSentAt: Instant, val liftAvailableAt: Instant) : LiftOutcome

    /** Second call — the restriction has been lifted. */
    data object Lifted : LiftOutcome
}
