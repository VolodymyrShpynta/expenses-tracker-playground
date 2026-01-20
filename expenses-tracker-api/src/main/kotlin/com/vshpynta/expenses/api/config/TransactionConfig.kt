package com.vshpynta.expenses.api.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Primary
import org.springframework.data.r2dbc.core.R2dbcEntityTemplate
import org.springframework.r2dbc.connection.R2dbcTransactionManager
import org.springframework.transaction.ReactiveTransactionManager

/**
 * Transaction configuration
 * Marks R2DBC transaction manager as primary since we use it for application runtime
 * JDBC transaction manager is only used by Flyway during startup
 */
@Configuration
class TransactionConfig {

    @Bean
    @Primary
    fun reactiveTransactionManager(r2dbcEntityTemplate: R2dbcEntityTemplate): ReactiveTransactionManager {
        return R2dbcTransactionManager(r2dbcEntityTemplate.databaseClient.connectionFactory)
    }
}
