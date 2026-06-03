package com.vshpynta.expenses.api.service.gdpr

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Duration

/**
 * Outbound notification port for the GDPR subsystem (inactivity
 * warnings, pre-lift Art. 18(3) notices, post-erasure confirmation).
 *
 * **TODO — production email transport.** The current implementation is
 * a deliberate structured-log stub. It records *what* would have been
 * sent — recipient `userId`, kind of notice, key timing — without
 * depending on a real SMTP / transactional-mail provider. Two consumers
 * are affected:
 *
 *   * [InactivityRetentionJob] — disabled by default
 *     (`app.gdpr.inactivity.enabled=false`) precisely because turning
 *     it on without real email would erase accounts after only a log
 *     line as warning, which is unsafe.
 *   * [ProcessingRestrictionService] — the Art. 18(3) pre-lift notice
 *     is technically satisfied by an in-band HTTP response today; the
 *     log line is a belt-and-braces audit record.
 *
 * Wiring a production transport (SES, Mailgun, JavaMailSender) is a
 * bean-replacement exercise — call sites do **not** change. Until that
 * happens, do not enable the inactivity job in production.
 *
 * Recipient resolution is delegated to the caller: in the inactivity
 * pipeline that is a Keycloak Admin API lookup for the user's verified
 * email; for in-session notices it can be the email in the JWT
 * `email` claim. The notifier itself is intentionally identity-agnostic.
 */
@Service
class UserNotificationService {

    companion object {
        private val logger = LoggerFactory.getLogger(UserNotificationService::class.java)
    }

    // TODO(gdpr-email): replace logger.warn with a transactional email send.
    fun sendInactivityWarning(userId: String, willEraseInDays: Long) {
        logger.warn(
            "GDPR notification (stub): inactivity warning for user {} — account will be erased in {} days",
            userId, willEraseInDays
        )
    }

    // TODO(gdpr-email): replace logger.info with a transactional email send.
    fun sendPreLiftNotice(userId: String, liftAvailableAfter: Duration) {
        logger.info(
            "GDPR notification (stub): pre-lift notice for user {} — restriction can be lifted after {}",
            userId, liftAvailableAfter
        )
    }

    // TODO(gdpr-email): replace logger.info with a transactional email send.
    fun sendErasureConfirmation(userId: String) {
        logger.info(
            "GDPR notification (stub): erasure confirmation for user {} — account and data removed",
            userId
        )
    }
}
