package com.vshpynta.expenses.api.config.gdpr

import com.github.benmanes.caffeine.cache.Cache
import com.github.benmanes.caffeine.cache.Caffeine
import com.vshpynta.expenses.api.repository.gdpr.AccountActivityRepository
import kotlinx.coroutines.reactor.mono
import org.slf4j.LoggerFactory
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken
import org.springframework.stereotype.Component
import org.springframework.web.server.ServerWebExchange
import org.springframework.web.server.WebFilter
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono
import java.time.Clock
import java.time.Instant

/**
 * Updates the `account_activity.last_seen_at` column for the
 * authenticated user. Runs **after** Spring Security has populated the
 * security context (filter order > security filter chain).
 *
 * Two layers of debouncing:
 *   * an in-memory Caffeine cache (`userId -> last touch instant`) that
 *     short-circuits the DB write when the same user fires many requests
 *     within [GdprProperties.Activity.touchDebounce]. The TTL is set to
 *     the debounce window, so an entry's mere presence means "we touched
 *     within the window" — and stale entries are evicted automatically;
 *   * the SQL UPSERT has its own `WHERE EXCLUDED.last_seen_at >
 *     last_seen_at` guard so concurrent racing writes converge correctly.
 *
 * Using Caffeine (rather than a `ConcurrentHashMap`) keeps memory
 * bounded — `maximumSize` caps the working set and `expireAfterWrite`
 * mirrors the debounce window so we never hold entries that could no
 * longer short-circuit a touch.
 *
 * Failures in the touch are swallowed — losing a last-seen update on a
 * transient DB blip is fine; failing the original request because of
 * GDPR bookkeeping would not be.
 */
@Component
class AccountActivityFilter(
    private val repository: AccountActivityRepository,
    properties: GdprProperties,
    private val clock: Clock,
) : WebFilter {

    companion object {
        private val logger = LoggerFactory.getLogger(AccountActivityFilter::class.java)
    }

    private val lastTouchByUser: Cache<String, Instant> = Caffeine.newBuilder()
        .expireAfterWrite(properties.activity.touchDebounce)
        .maximumSize(properties.activity.cacheMaxEntries)
        .build()

    override fun filter(exchange: ServerWebExchange, chain: WebFilterChain): Mono<Void> {
        return chain.filter(exchange).then(
            exchange.getPrincipal<JwtAuthenticationToken>()
                .flatMap { auth -> touchIfNeeded(auth.token) }
                .onErrorResume { err ->
                    logger.warn("Failed to touch account_activity (ignored): {}", err.message)
                    Mono.empty()
                }
        )
    }

    private fun touchIfNeeded(jwt: Jwt): Mono<Void> {
        val userId = jwt.subject ?: return Mono.empty()
        if (lastTouchByUser.getIfPresent(userId) != null) {
            return Mono.empty()
        }
        val now = clock.instant()
        lastTouchByUser.put(userId, now)
        return mono { repository.touch(userId, now) }.then()
    }
}
