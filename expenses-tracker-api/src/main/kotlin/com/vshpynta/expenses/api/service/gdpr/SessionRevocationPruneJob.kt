package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.gdpr.GdprProperties
import com.vshpynta.expenses.api.repository.gdpr.SessionRevocationRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.time.Clock

/**
 * Periodically deletes `session_revocations` rows whose every covered
 * access token has already expired on its own (i.e. `expires_at +
 * pruneSafetyMargin < now()`). Keeps the table — and therefore every
 * pod's in-memory snapshot — bounded by what's actually still
 * enforceable.
 *
 * **Coordination across pods.** The DELETE is idempotent — pods
 * racing on the same predicate would just produce one winner with
 * `rowsAffected = N` and N-1 losers with `0` — so correctness does
 * not require coordination. We still gate the tick with
 * `@SchedulerLock`, however, so that exactly one replica per cluster
 * actually issues the DELETE per fire. Reasoning:
 *
 *   * **WAL pressure.** Even a zero-row DELETE issues a `COMMIT`,
 *     and each COMMIT is one WAL fsync. Multiplied across N replicas
 *     × 288 ticks/day this is meaningful background load on a small
 *     PG instance for zero correctness gain.
 *   * **Row-lock contention when rows DO exist.** Multiple replicas
 *     racing on the same set of rows briefly queue on row-level
 *     locks; the lock-table round trip is far cheaper than that
 *     contention plus its associated WAL fsyncs.
 *   * **Operational clarity.** One log line / one metric tick per
 *     fire across the cluster, not N. Makes "is prune actually
 *     running?" trivially observable.
 *   * **Constant scaling.** DB load no longer grows linearly with
 *     replica count.
 *
 * The lock-table infrastructure is already wired by
 * [com.vshpynta.expenses.api.config.gdpr.GdprShedLockConfig] (used
 * by [InactivityRetentionJob]), so the marginal cost here is one
 * annotation.
 *
 * **Cache coupling.** Pruning a row does NOT need to coordinate with
 * the in-memory caches. By definition every JWT a pruned row would
 * have rejected has already expired on its own, so a momentarily
 * stale cache entry produces no false rejections — and the entry's
 * own per-entry TTL (derived from the row's `expires_at`) drops it
 * shortly after.
 */
@Component
class SessionRevocationPruneJob(
    private val repository: SessionRevocationRepository,
    private val properties: GdprProperties,
    private val clock: Clock,
) {

    /**
     * `fixedDelayString` is resolved from
     * [GdprProperties.Revocation.pruneInterval] (default 5 min). The
     * `fixedDelay` semantics — wait `pruneInterval` AFTER the previous
     * run completes — guarantee no two runs on the same pod overlap;
     * `@SchedulerLock` guarantees no two runs across pods overlap
     * either.
     *
     * **Lock parameters.**
     *   * `lockAtMostFor = PT1M` — the DELETE is a single indexed
     *     statement that completes in milliseconds. 1 minute is a
     *     generous ceiling that still releases the lock long before
     *     the next 5-min fire if a JVM dies mid-tick.
     *   * `lockAtLeastFor = PT0S` — release as soon as the method
     *     returns; the cron interval naturally spaces the next
     *     acquire attempt across replicas.
     */
    @Scheduled(fixedDelayString = "\${app.gdpr.revocation.prune-interval}")
    @SchedulerLock(
        name = "session-revocation-prune",
        lockAtMostFor = "PT1M",
        lockAtLeastFor = "PT0S",
    )
    fun prune() {
        runBlocking {
            try {
                val cutoff = clock.instant().minus(properties.revocation.pruneSafetyMargin)
                val rows = repository.deleteExpired(cutoff)
                if (rows > 0) {
                    logger.info(
                        "Pruned {} expired session_revocations rows older than {}",
                        rows, cutoff
                    )
                }
            } catch (ce: CancellationException) {
                throw ce
            } catch (t: Throwable) {
                logger.warn("Session-revocation prune tick failed", t)
            }
        }
    }

    companion object {
        private val logger = LoggerFactory.getLogger(SessionRevocationPruneJob::class.java)
    }
}
