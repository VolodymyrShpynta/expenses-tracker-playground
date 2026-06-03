package com.vshpynta.expenses.api.service

import com.vshpynta.expenses.api.controller.dto.ImportResultDto
import com.vshpynta.expenses.api.service.gdpr.WritesUserData

/**
 * Facade for the export / import pipeline.
 *
 * Concrete behaviour lives in [DefaultDataExchangeService]; GDPR
 * Art. 18 enforcement (for imports — exports are reads) lives in the
 * `GdprAwareDataExchangeService` decorator (in the `service.gdpr`
 * package), which is wired as the `@Primary` bean.
 *
 * Methods annotated with [WritesUserData] are gated by
 * `ProcessingRestrictionGuard` in the decorator. The
 * `GdprDecoratorArchTest` asserts that every such method is overridden
 * by the decorator and that the override invokes the guard.
 */
interface DataExchangeService {

    /** Read-side — allowed during a restriction (Art. 18(2)). */
    suspend fun exportAsJson(): ByteArray

    /** Read-side — allowed during a restriction (Art. 18(2)). */
    suspend fun exportAsCsvZip(): ByteArray

    @WritesUserData
    suspend fun importJson(bytes: ByteArray): ImportResultDto

    @WritesUserData
    suspend fun importCsvZip(bytes: ByteArray): ImportResultDto

    @WritesUserData
    suspend fun importExpensesCsv(bytes: ByteArray): ImportResultDto
}
