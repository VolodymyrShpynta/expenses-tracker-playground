package com.vshpynta.expenses.api.config.gdpr

import com.vshpynta.expenses.api.service.gdpr.SessionRevocationService
import io.r2dbc.postgresql.api.Notification
import io.r2dbc.postgresql.api.PostgresqlConnection
import io.r2dbc.spi.ConnectionFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.reactive.asFlow
import kotlinx.coroutines.reactive.awaitFirstOrNull
import kotlinx.coroutines.runBlocking
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.SmartLifecycle
import org.springframework.stereotype.Component
import reactor.core.publisher.Mono
import kotlin.time.toKotlinDuration

/**
 * Owns the cross-pod synchronisation for [SessionRevocationService]'s
 * in-memory cache.
 *
 * **What this bean does, in order:**
 *
 *   1. **At startup** (inside [start], synchronously) — opens a dedicated
 *      PostgreSQL connection, subscribes to `LISTEN session_revoked`,
 *      then loads the cache snapshot via [SessionRevocationService.loadSnapshot].
 *      The LISTEN subscribe must precede the snapshot SELECT so any
 *      revocation that arrives mid-load is buffered by Postgres and
 *      replayed afterwards, closing the bootstrap race window. Spring's
 *      `SmartLifecycle` contract means the bean is not [isRunning] —
 *      and therefore the application is not ready to serve traffic —
 *      until both steps complete.
 *   2. **At steady state** — consumes notifications and forwards each
 *      `userId` payload to [SessionRevocationService.refreshFromDb],
 *      which re-reads the row and puts-or-removes the cache entry.
 *   3. **On connection drop** — retries the open / LISTEN / snapshot
 *      cycle after [GdprProperties.Revocation.notifyReconnectDelay].
 *      The fresh snapshot on every reconnect is the reconciliation
 *      backstop against any NOTIFYs missed while disconnected.
 *
 * **Disabled mode.** When [GdprProperties.Revocation.notifyEnabled]
 * is `false`, the bean still loads the initial snapshot — the cache
 * is mandatory for [com.vshpynta.expenses.api.config.gdpr.SessionRevocationFilter]
 * to work — but skips LISTEN entirely. In that mode the cache only
 * ever changes via local writes; peer pods on the same DB diverge,
 * which is acceptable only for single-replica deployments.
 *
 * **Why a dedicated, non-pooled connection.** A pooled connection
 * cannot host a long-lived `LISTEN` subscription: returning it to
 * the pool drops the subscription, and holding it forever steals a
 * slot from the request-path pool. The dedicated factory we use
 * here ([GdprConfig.listenConnectionFactory]) is intentionally
 * built without `r2dbc-pool` so its sole connection is owned
 * end-to-end by this bean.
 *
 * **Idempotency.** The pod that *writes* a revocation also
 * receives its own NOTIFY and refreshes again — harmless, since
 * the write path already populated the cache synchronously.
 */
@Component
class SessionRevocationListener(
    @Qualifier("listenConnectionFactory")
    private val connectionFactory: ConnectionFactory,
    private val properties: GdprProperties,
    private val sessionRevocationService: SessionRevocationService,
) : SmartLifecycle {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    @Volatile
    private var running = false

    @Volatile
    private var listening = false

    @Volatile
    private var connection: PostgresqlConnection? = null

    override fun start() {
        if (!properties.revocation.notifyEnabled) {
            startWithoutFanOut()
        } else {
            startWithFanOut()
        }
    }

    /**
     * Fan-out disabled mode: the cache is still mandatory for the
     * filter, so load the snapshot synchronously (blocks readiness
     * until it's populated) but skip the LISTEN subscribe entirely.
     * Peer pods on the same DB would diverge in this mode — only
     * acceptable for single-replica deployments.
     */
    private fun startWithoutFanOut() {
        runBlocking { sessionRevocationService.loadSnapshot() }
        running = true
        logger.info(
            "Session-revocation LISTEN/NOTIFY disabled by configuration; " +
                    "loaded initial snapshot without cross-pod fan-out"
        )
    }

    /**
     * Fan-out enabled mode: perform the first open + LISTEN + snapshot
     * cycle synchronously (blocking readiness on success or failure),
     * then hand off to the background consumer loop.
     */
    private fun startWithFanOut() {
        val channel = properties.revocation.notifyChannel
        // Block startup until LISTEN is subscribed AND the snapshot is
        // loaded. If either fails, throw — the application should not
        // reach READY in an inconsistent state.
        connection = runBlocking { openListenAndLoadSnapshot(channel) }
        listening = true
        running = true
        scope.launch { consumeForever(channel, connection) }
    }

    /**
     * @return whether the listener currently has an active `LISTEN`
     * subscription. Useful for tests that need to wait until the
     * subscription is in place before publishing a notification.
     */
    fun isListening(): Boolean = listening

    /**
     * Opens a dedicated PG connection from [connectionFactory],
     * subscribes to `LISTEN [channel]`, then loads the snapshot.
     * Order matters — LISTEN must be active before the snapshot
     * SELECT so any concurrent revocation is captured by either the
     * snapshot or the buffered notification (never lost between the
     * two).
     */
    private suspend fun openListenAndLoadSnapshot(channel: String): PostgresqlConnection {
        val conn = connectionFactory.create().awaitFirstOrNull()
            ?: error("ConnectionFactory returned no connection")

        // The R2DBC SPI returns the vendor-neutral [io.r2dbc.spi.Connection],
        // but `LISTEN/NOTIFY` is Postgres-specific — we need the driver type
        // for `.notifications` below. Narrow with `is` (also enables the
        // smart-cast for the rest of the function). On mismatch, close the
        // already-opened socket before throwing so we don't leak the
        // connection; `runCatching` makes sure a secondary close failure
        // doesn't mask the primary `error(...)`.
        if (conn !is PostgresqlConnection) {
            runCatching { Mono.from(conn.close()).subscribe() }
            error("Expected PostgresqlConnection but got ${conn.javaClass.name}")
        }

        try {
            conn.createStatement("LISTEN $channel").execute().awaitFirstOrNull()
            sessionRevocationService.loadSnapshot()
            logger.info("Listening for session-revocation notifications on channel '{}'", channel)
            return conn
        } catch (e: Exception) {
            runCatching { Mono.from(conn.close()).subscribe() } // try to close connection
            throw e
        }
    }

    /**
     * Background driver: keeps a LISTEN cycle running for the lifetime
     * of the bean, reconnecting with a back-off whenever the underlying
     * R2DBC connection drops. Each iteration runs exactly one
     * open → consume → close cycle (see [runListenCycle]).
     *
     * The very first iteration re-uses [initialConnection] (opened by
     * [start]) so we don't pay the open / LISTEN / snapshot cost twice;
     * every subsequent iteration opens its own connection.
     */
    private suspend fun consumeForever(channel: String, initialConnection: PostgresqlConnection?) {
        var reuseConnection: PostgresqlConnection? = initialConnection
        while (running && currentCoroutineContext().isActive) {
            runListenCycle(channel, reuseConnection)
            reuseConnection = null
            if (!running) break
            delay(properties.revocation.notifyReconnectDelay.toKotlinDuration())
        }
    }

    /**
     * One open → consume → close cycle. Suspends until the underlying
     * R2DBC connection fails or [stop] is called. Non-cancellation
     * errors are logged here (and only here) so the outer loop just
     * needs to sleep and try again.
     */
    private suspend fun runListenCycle(
        channel: String,
        reuseConnection: PostgresqlConnection?,
    ) {
        try {
            val conn = reuseConnection ?: openAndTrack(channel)
            conn.notifications.asFlow().collect { handle(it) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (running) {
                logger.warn(
                    "Session-revocation LISTEN failed; retrying in {}",
                    properties.revocation.notifyReconnectDelay, e
                )
            }
        } finally {
            listening = false
            closeCurrentConnection()
        }
    }

    /**
     * [openListenAndLoadSnapshot] + book-keeping: stash the fresh
     * connection in [connection] and flip [listening] so observers
     * (notably tests) can see the subscription is live.
     */
    private suspend fun openAndTrack(channel: String): PostgresqlConnection =
        openListenAndLoadSnapshot(channel).also {
            connection = it
            listening = true
        }

    /**
     * Fire-and-forget close of [connection]. Idempotent — `runCatching`
     * swallows the inevitable error from closing an already-closed
     * connection (e.g. when [stop] closed it first).
     */
    private fun closeCurrentConnection() {
        connection?.let { runCatching { Mono.from(it.close()).subscribe() } }
        connection = null
    }

    private suspend fun handle(notification: Notification) {
        val userId = notification.parameter?.takeIf { it.isNotBlank() }
        if (userId == null) {
            logger.debug("Received {} with empty payload; ignoring", notification.name)
            return
        }
        try {
            sessionRevocationService.refreshFromDb(userId)
            logger.debug("Refreshed revocation cache for user {} via LISTEN/NOTIFY", userId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            logger.warn(
                "Failed to refresh cache for user {} after NOTIFY; entry will be reconciled on next reconnect",
                userId, e
            )
        }
    }

    override fun stop() {
        running = false
        listening = false
        closeCurrentConnection()
        scope.cancel()
    }

    override fun isRunning(): Boolean = running

    /**
     * Forced to the smallest possible value so this bean's [start]
     * runs **before** Spring Boot's `WebServerStartStopLifecycle`
     * (which sits at `SmartLifecycle.DEFAULT_PHASE − 2048`). Without
     * an explicit override the listener inherits the default phase
     * (`Integer.MAX_VALUE`) and starts *after* the reactive web
     * server is already accepting traffic — during that window the
     * cache would be empty and the filter would mis-classify every
     * revoked session as "not revoked". K8s readiness probes mitigate
     * the gap by holding traffic until `ApplicationReadyEvent` fires;
     * non-K8s deployments (Azure App Service Linux, plain nginx in
     * front of a JVM) do not, so we close the window unconditionally.
     *
     * Beneficial shutdown side-effect: SmartLifecycle stops in
     * reverse phase order (highest first), so a low phase here means
     * [stop] runs *after* the web server stops accepting requests —
     * the LISTEN connection stays open while in-flight requests
     * drain, which is what we want.
     */
    override fun getPhase(): Int = Int.MIN_VALUE

    companion object {
        private val logger = LoggerFactory.getLogger(SessionRevocationListener::class.java)
    }
}
