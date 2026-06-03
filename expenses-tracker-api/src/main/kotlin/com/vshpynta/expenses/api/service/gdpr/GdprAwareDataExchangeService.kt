package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.controller.dto.ImportResultDto
import com.vshpynta.expenses.api.service.DataExchangeService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.context.annotation.Primary
import org.springframework.stereotype.Service

/**
 * Decorator that enforces Art. 18 processing restrictions on every
 * import path. Registered as `@Primary`, so this is the bean
 * controllers receive when they inject [DataExchangeService].
 *
 * Each `import*` method invokes
 * [ProcessingRestrictionGuard.requireWritesAllowed] before delegating;
 * the decorator is the only place in the codebase that knows about
 * restrictions for the data-exchange surface. Export paths are
 * forwarded without a guard call — Art. 18(2) allows the subject's own
 * reads during a restriction.
 *
 * **No `by delegate` on purpose.** Each method is forwarded
 * explicitly. The compiler then enforces "implement every interface
 * method", and the `GdprDecoratorArchTest` enforces "every override of
 * a [WritesUserData] method must call the guard". Together they
 * eliminate the silent-bypass failure mode where a new interface
 * method gets a free pass.
 *
 * **No `@Transactional` here.** Imports are not single-statement
 * writes — each parsed row goes through the standard command path,
 * which opens its own per-row transaction in `DataImporter`. Adding
 * `@Transactional` on the whole import would wrap thousands of rows
 * in one transaction, which is undesirable for both lock duration and
 * memory. The guard check is a single PK lookup that's fine outside
 * any transaction.
 */
@Service
@Primary
class GdprAwareDataExchangeService(
    @Qualifier("defaultDataExchangeService")
    private val delegate: DataExchangeService,
    private val guard: ProcessingRestrictionGuard,
) : DataExchangeService {

    // Read-side — no guard.
    override suspend fun exportAsJson(): ByteArray = delegate.exportAsJson()

    // Read-side — no guard.
    override suspend fun exportAsCsvZip(): ByteArray = delegate.exportAsCsvZip()

    override suspend fun importJson(bytes: ByteArray): ImportResultDto {
        guard.requireWritesAllowed()
        return delegate.importJson(bytes)
    }

    override suspend fun importCsvZip(bytes: ByteArray): ImportResultDto {
        guard.requireWritesAllowed()
        return delegate.importCsvZip(bytes)
    }

    override suspend fun importExpensesCsv(bytes: ByteArray): ImportResultDto {
        guard.requireWritesAllowed()
        return delegate.importExpensesCsv(bytes)
    }
}
