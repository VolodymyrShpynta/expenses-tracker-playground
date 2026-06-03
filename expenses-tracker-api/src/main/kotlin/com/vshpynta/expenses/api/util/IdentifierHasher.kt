package com.vshpynta.expenses.api.util

import org.springframework.stereotype.Component
import java.security.MessageDigest

/**
 * SHA-256 hashing for identifiers we want to retain in audit logs after
 * the underlying subject has been erased. Hashing — rather than keeping
 * the raw `user_id` — is what lets a `gdpr_erasure_log` row survive Art.
 * 17 without re-introducing personal data: a hash detached from the
 * original identifier is no longer a re-identifier on its own.
 *
 * Salting is intentionally **not** applied. The whole point is that the
 * same `user_id` always hashes to the same value so an auditor can
 * verify "this hash corresponds to this user" by re-hashing the raw id
 * *before* it is erased; after erasure, the hash is by design
 * uncorrelatable to anything in the system.
 */
@Component
class IdentifierHasher {

    /**
     * SHA-256 of [value] encoded as lower-case base16. Stable across
     * processes and JVMs.
     */
    fun hash(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8))
        return digest.joinToString(separator = "") { "%02x".format(it) }
    }
}
