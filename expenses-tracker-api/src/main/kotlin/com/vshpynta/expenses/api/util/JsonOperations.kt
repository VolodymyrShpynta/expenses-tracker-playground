package com.vshpynta.expenses.api.util

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component

/**
 * General-purpose JSON operations utility
 *
 * Provides reusable JSON serialization/deserialization operations
 */
@Component
class JsonOperations(
    private val objectMapper: ObjectMapper
) {

    /**
     * Serializes object to JSON string
     */
    fun <T> toJson(value: T): String {
        return objectMapper.writeValueAsString(value)
    }

    /**
     * Deserializes JSON string to specified type
     */
    fun <T> fromJson(json: String, type: Class<T>): T {
        return objectMapper.readValue(json, type)
    }

    /**
     * Converts object from one type to another via JSON
     * Useful for DTO conversions
     */
    fun <T> convert(value: Any, targetType: Class<T>): T {
        return objectMapper.convertValue(value, targetType)
    }
}
