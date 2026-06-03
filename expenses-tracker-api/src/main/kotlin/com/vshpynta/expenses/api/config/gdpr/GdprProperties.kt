package com.vshpynta.expenses.api.config.gdpr

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

/**
 * Configuration knobs for the GDPR subsystem. Defaults match the
 * design recorded in [GDPR.md](../../../../../../../../../../GDPR.md):
 * 3-year inactivity threshold + 90-day grace + 5-minute fresh-auth
 * window + 7-day lift dwell.
 *
 * Values are deliberately conservative — they can be tightened in
 * production via environment variables without redeploying.
 */
@ConfigurationProperties(prefix = "app.gdpr")
data class GdprProperties(
    val freshAuth: FreshAuth = FreshAuth(),
    val restriction: Restriction = Restriction(),
    val inactivity: Inactivity = Inactivity(),
    val activity: Activity = Activity(),
    val keycloak: Keycloak = Keycloak(),
) {
    /**
     * Maximum age of the JWT `auth_time` claim for endpoints that
     * require fresh re-authentication (account deletion, restriction
     * lifecycle changes). Reject anything older.
     */
    data class FreshAuth(val maxAge: Duration = Duration.ofMinutes(5))

    /**
     * Minimum dwell between sending the Art. 18(3) pre-lift notice and
     * being allowed to actually lift the restriction. This is the
     * mechanism that makes the notification duty enforceable.
     */
    data class Restriction(val liftDwell: Duration = Duration.ofDays(7))

    data class Inactivity(
        /** No login for this long ⇒ warning email is sent. */
        val warningAfter: Duration = Duration.ofDays(365L * 3L),
        /** Grace window between the warning and erasure. */
        val erasureGrace: Duration = Duration.ofDays(90),
        /** Cron expression for the scheduled job (default: 03:00 UTC daily). */
        val cron: String = "0 0 3 * * *",
        /** Master switch — keep `false` until email transport is wired up. */
        val enabled: Boolean = false,
    )

    /**
     * Debounce knobs for the `last_seen_at` writer.
     *
     * @property touchDebounce minimum interval between two DB writes
     *   for the same user. Touching the table on literally every
     *   request would multiply write load on a hot path; updating at
     *   most once per [touchDebounce] per user is accurate enough for a
     *   multi-month retention window.
     * @property cacheMaxEntries hard upper bound on the in-memory
     *   debounce cache. Caps memory under unique-user spikes (e.g., a
     *   bot scan). Each entry is ~80 bytes, so 100k entries is ~8 MB.
     *   Older entries are evicted in LRU order once the bound is hit.
     */
    data class Activity(
        val touchDebounce: Duration = Duration.ofMinutes(15),
        val cacheMaxEntries: Long = 100_000L,
    )

    /**
     * Keycloak Admin API access for the post-erasure cascade. When
     * `enabled = false` (the default), the erasure pipeline logs a
     * warning and continues — the operator gets a manual follow-up
     * task. Real deployments should configure a confidential client
     * with `manage-users` realm-management role.
     *
     * [tokenPath] and [userPath] are path templates appended to
     * [baseUrl]. They exist as escape hatches: if a future Keycloak
     * version (or a different OIDC provider) rearranges its URL
     * layout, operators can re-point the client without a code
     * change. The defaults match Keycloak 17+ (no `/auth` prefix).
     * Supported placeholders: `{realm}` in both templates, `{userId}`
     * in [userPath].
     */
    data class Keycloak(
        val enabled: Boolean = false,
        val baseUrl: String = "",
        val realm: String = "",
        val clientId: String = "",
        val clientSecret: String = "",
        val tokenPath: String = "/realms/{realm}/protocol/openid-connect/token",
        val userPath: String = "/admin/realms/{realm}/users/{userId}",
    ) {
        /** Absolute URL of the OIDC token endpoint. */
        fun tokenUrl(): String =
            baseUrl + tokenPath.replace("{realm}", realm)

        /** Absolute URL of the Admin REST user resource for [userId]. */
        fun userUrl(userId: String): String =
            baseUrl + userPath.replace("{realm}", realm).replace("{userId}", userId)
    }
}
