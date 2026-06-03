package com.vshpynta.expenses.api.service.gdpr

import com.vshpynta.expenses.api.controller.dto.ImportResultDto
import com.vshpynta.expenses.api.model.gdpr.RestrictionGround
import com.vshpynta.expenses.api.service.DataExchangeService
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.Mock
import org.mockito.Mockito.inOrder
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.junit.jupiter.MockitoExtension
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.whenever

/**
 * Unit tests for [GdprAwareDataExchangeService]. Verifies that every
 * import (write) invokes
 * [ProcessingRestrictionGuard.requireWritesAllowed] before delegating,
 * that a guard violation short-circuits before the delegate runs, and
 * that export-side methods do NOT call the guard (Art. 18(2)
 * carve-out).
 */
@ExtendWith(MockitoExtension::class)
class GdprAwareDataExchangeServiceTest {

    @Mock
    private lateinit var delegate: DataExchangeService

    @Mock
    private lateinit var guard: ProcessingRestrictionGuard

    @Test
    fun `exportAsJson should not call guard`() = runTest {
        // Given
        whenever(delegate.exportAsJson()) doReturn ByteArray(0)
        val decorator = GdprAwareDataExchangeService(delegate, guard)

        // When
        decorator.exportAsJson()

        // Then
        verify(guard, never()).requireWritesAllowed()
        verify(delegate).exportAsJson()
    }

    @Test
    fun `exportAsCsvZip should not call guard`() = runTest {
        // Given
        whenever(delegate.exportAsCsvZip()) doReturn ByteArray(0)
        val decorator = GdprAwareDataExchangeService(delegate, guard)

        // When
        decorator.exportAsCsvZip()

        // Then
        verify(guard, never()).requireWritesAllowed()
        verify(delegate).exportAsCsvZip()
    }

    @Test
    fun `importJson should call guard then delegate`() = runTest {
        // Given
        val expected = ImportResultDto(0, 0, 0)
        whenever(delegate.importJson(any())) doReturn expected
        val decorator = GdprAwareDataExchangeService(delegate, guard)

        // When
        val result = decorator.importJson(ByteArray(0))

        // Then
        assertThat(result).isSameAs(expected)
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).importJson(any())
    }

    @Test
    fun `importCsvZip should call guard then delegate`() = runTest {
        // Given
        val expected = ImportResultDto(0, 0, 0)
        whenever(delegate.importCsvZip(any())) doReturn expected
        val decorator = GdprAwareDataExchangeService(delegate, guard)

        // When
        val result = decorator.importCsvZip(ByteArray(0))

        // Then
        assertThat(result).isSameAs(expected)
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).importCsvZip(any())
    }

    @Test
    fun `importExpensesCsv should call guard then delegate`() = runTest {
        // Given
        val expected = ImportResultDto(0, 0, 0)
        whenever(delegate.importExpensesCsv(any())) doReturn expected
        val decorator = GdprAwareDataExchangeService(delegate, guard)

        // When
        val result = decorator.importExpensesCsv(ByteArray(0))

        // Then
        assertThat(result).isSameAs(expected)
        val ordered = inOrder(guard, delegate)
        ordered.verify(guard).requireWritesAllowed()
        ordered.verify(delegate).importExpensesCsv(any())
    }

    @Test
    fun `import methods should not call delegate when guard throws`() {
        // Given
        runBlocking {
            doThrow(ProcessingRestrictedException("user-1", RestrictionGround.OBJECTION_PENDING))
                .whenever(guard).requireWritesAllowed()
        }
        val decorator = GdprAwareDataExchangeService(delegate, guard)

        // When / Then
        assertThatThrownBy {
            runBlocking { decorator.importJson(ByteArray(0)) }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        assertThatThrownBy {
            runBlocking { decorator.importCsvZip(ByteArray(0)) }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        assertThatThrownBy {
            runBlocking { decorator.importExpensesCsv(ByteArray(0)) }
        }.isInstanceOf(ProcessingRestrictedException::class.java)

        runBlocking {
            verify(delegate, never()).importJson(any())
            verify(delegate, never()).importCsvZip(any())
            verify(delegate, never()).importExpensesCsv(any())
        }
    }
}
