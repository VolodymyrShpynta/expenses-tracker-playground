package com.vshpynta.expenses.api.config

import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.ApplicationContext
import org.springframework.context.annotation.Bean
import org.springframework.test.web.reactive.server.WebTestClient

@TestConfiguration
class WebTestClientConfig {

    @Bean
    fun webTestClient(applicationContext: ApplicationContext): WebTestClient {
        return WebTestClient
            .bindToApplicationContext(applicationContext)
            .configureClient()
            .build()
    }
}
