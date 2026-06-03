package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.config.gdpr.GdprProperties
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.reactive.awaitFirst
import kotlinx.coroutines.reactor.awaitSingleOrNull
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.util.LinkedMultiValueMap
import org.springframework.web.reactive.function.BodyInserters
import org.springframework.web.reactive.function.client.WebClient
import org.springframework.web.reactive.function.client.WebClientResponseException

/**
 * Cascades the post-erasure step that lives in Keycloak: deleting the
 * actual user account so it cannot log back in.
 *
 * Disabled by default. When `app.gdpr.keycloak.enabled = false` the
 * cascade is skipped and the operator gets a structured warning — the
 * backend erasure still completes; this is intentional, because in a
 * self-host scenario the operator may want to handle Keycloak deletion
 * manually rather than grant a confidential client the
 * `manage-users` realm role.
 *
 * When enabled, uses the client-credentials grant against the realm's
 * token endpoint, then calls the standard `admin/realms/{realm}/users/
 * {id}` DELETE. Token caching is intentionally not implemented — this
 * is invoked at most a handful of times per day; the extra ~50ms is
 * negligible compared to keeping a token cache correct under realm
 * rotation.
 */
@Service
class KeycloakAdminClient(
    private val properties: GdprProperties,
    webClientBuilder: WebClient.Builder = WebClient.builder(),
) {

    companion object {
        private val logger = LoggerFactory.getLogger(KeycloakAdminClient::class.java)
    }

    private val client: WebClient = webClientBuilder.build()

    /**
     * Returns `true` if the Keycloak account was deleted (or was already
     * gone), `false` if the cascade was skipped (subsystem disabled, or
     * a recoverable failure occurred — see the warning log).
     *
     * Network / 5xx failures are caught and logged rather than thrown,
     * so a transient Keycloak outage cannot prevent the operator from
     * completing erasure of the application data. [CancellationException]
     * is propagated so coroutine cancellation still works.
     */
    suspend fun deleteUser(userId: String): Boolean {
        val cfg = properties.keycloak
        if (!cfg.enabled) {
            logger.warn(
                "Keycloak admin cascade is disabled — manual delete required for user {}",
                userId
            )
            return false
        }
        return try {
            val token = fetchAdminToken()
            client.delete()
                .uri(cfg.userUrl(userId))
                .header("Authorization", "Bearer $token")
                .exchangeToMono { response ->
                    when {
                        response.statusCode().is2xxSuccessful ||
                            response.statusCode() == HttpStatus.NOT_FOUND -> response.releaseBody()
                        else -> response.createException()
                    }
                }
                .awaitSingleOrNull()
            true
        } catch (ce: CancellationException) {
            throw ce
        } catch (ex: WebClientResponseException) {
            logger.error(
                "Keycloak admin cascade failed for user {}: {} {}",
                userId, ex.statusCode, ex.responseBodyAsString
            )
            false
        } catch (ex: Throwable) {
            logger.error("Keycloak admin cascade failed for user {}", userId, ex)
            false
        }
    }

    private suspend fun fetchAdminToken(): String {
        val cfg = properties.keycloak
        val body = LinkedMultiValueMap<String, String>().apply {
            add("grant_type", "client_credentials")
            add("client_id", cfg.clientId)
            add("client_secret", cfg.clientSecret)
        }

        val response = client.post()
            .uri(cfg.tokenUrl())
            .contentType(MediaType.APPLICATION_FORM_URLENCODED)
            .body(BodyInserters.fromFormData(body))
            .retrieve()
            .bodyToMono(Map::class.java)
            .awaitFirst()

        return response["access_token"] as? String
            ?: error("Keycloak token response missing 'access_token'")
    }
}
