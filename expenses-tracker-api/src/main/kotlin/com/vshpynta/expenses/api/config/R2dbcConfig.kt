package com.vshpynta.expenses.api.config

import io.r2dbc.spi.Row
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.convert.converter.Converter
import org.springframework.data.convert.ReadingConverter
import org.springframework.data.convert.WritingConverter
import org.springframework.data.r2dbc.convert.R2dbcCustomConversions
import org.springframework.data.r2dbc.dialect.PostgresDialect
import java.util.UUID

/**
 * R2DBC custom converters for UUID <-> VARCHAR conversion
 * This allows us to store UUIDs as VARCHAR in the database for portability
 * while using UUID type in Kotlin code
 */
@Configuration
class R2dbcConfig {

    @Bean
    fun r2dbcCustomConversions(): R2dbcCustomConversions {
        val converters = listOf(
            UuidToStringConverter(),
            StringToUuidConverter(),
            RowToUuidConverter()
        )
        return R2dbcCustomConversions.of(PostgresDialect.INSTANCE, converters)
    }

    /**
     * Write UUID as String to database
     */
    @WritingConverter
    class UuidToStringConverter : Converter<UUID, String> {
        override fun convert(source: UUID): String = source.toString()
    }

    /**
     * Read String from database as UUID
     */
    @ReadingConverter
    class StringToUuidConverter : Converter<String, UUID> {
        override fun convert(source: String): UUID = UUID.fromString(source)
    }

    /**
     * Read UUID column from Row
     */
    @ReadingConverter
    class RowToUuidConverter : Converter<Row, UUID> {
        override fun convert(source: Row): UUID {
            val value = source.get(0)
            return when (value) {
                is UUID -> value
                is String -> UUID.fromString(value)
                else -> throw IllegalArgumentException("Cannot convert $value to UUID")
            }
        }
    }
}
