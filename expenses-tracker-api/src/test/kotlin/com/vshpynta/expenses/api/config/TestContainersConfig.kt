package com.vshpynta.expenses.api.config

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.testcontainers.service.connection.ServiceConnection
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import javax.sql.DataSource

/**
 * Testcontainers configuration for integration tests
 * Automatically starts a PostgreSQL container and configures Spring to use it
 *
 * Note: @ServiceConnection automatically configures R2DBC, but we need to explicitly
 * configure JDBC DataSource for Flyway migrations
 */
@TestConfiguration(proxyBeanMethods = false)
class TestContainersConfig {

    @Bean
    @ServiceConnection
    fun postgresContainer(): PostgreSQLContainer<*> {
        return PostgreSQLContainer(DockerImageName.parse("postgres:16-alpine"))
            .withDatabaseName("expenses_test")
            .withUsername("test")
            .withPassword("test")
            .withReuse(true) // Reuse container across test runs for speed
    }

    /**
     * Explicit JDBC DataSource for Flyway migrations
     * This is needed because Flyway requires JDBC, not R2DBC
     */
    @Bean
    @Primary
    fun dataSource(postgresContainer: PostgreSQLContainer<*>): DataSource {
        val config = HikariConfig().apply {
            jdbcUrl = postgresContainer.jdbcUrl
            username = postgresContainer.username
            password = postgresContainer.password
            driverClassName = "org.postgresql.Driver"
        }
        return HikariDataSource(config)
    }
}
