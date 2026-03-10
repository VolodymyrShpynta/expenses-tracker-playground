package com.vshpynta.expenses.api.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class JacksonConfig {

    /**
     * Explicit Jackson 2.x ObjectMapper bean for non-HTTP JSON operations
     * (e.g. internal file serialization).
     *
     * Spring Boot 4 uses Jackson 3.x (tools.jackson) for WebFlux codecs and no longer
     * auto-registers a com.fasterxml.jackson.databind.ObjectMapper bean.
     *
     * Intentionally NOT @Primary — WebFlux codec serialization is handled by Spring Boot 4's
     * Jackson 3.x auto-configuration and must not be overridden by this Jackson 2.x bean.
     */
    @Bean
    fun jackson2ObjectMapper(): ObjectMapper = ObjectMapper().registerKotlinModule()
}
