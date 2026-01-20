package com.vshpynta.expenses.api.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Jackson configuration for JSON serialization/deserialization
 */
@Configuration
class JacksonConfig {

    @Bean
    fun objectMapper(): ObjectMapper {
        return ObjectMapper().registerKotlinModule()
    }
}
