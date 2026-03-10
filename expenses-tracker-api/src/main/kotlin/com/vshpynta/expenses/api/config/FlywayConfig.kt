package com.vshpynta.expenses.api.config

import org.flywaydb.core.Flyway
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.jdbc.DataSourceBuilder
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import javax.sql.DataSource

@Configuration
@EnableConfigurationProperties(FlywayMigrationProperties::class)
class FlywayConfig {

    @Bean
    @ConfigurationProperties(prefix = "spring.flyway.datasource")
    fun flywayDataSource(): DataSource {
        return DataSourceBuilder.create().build()
    }

    @Bean(initMethod = "migrate")
    fun flyway(
        flywayDataSource: DataSource,
        flywayProperties: FlywayMigrationProperties
    ): Flyway {
        return Flyway.configure()
            .dataSource(flywayDataSource)
            .locations(*flywayProperties.locations.toTypedArray())
            .baselineOnMigrate(flywayProperties.baselineOnMigrate)
            .load()
    }
}

/**
 * Minimal Flyway migration properties bound to `spring.flyway.*`.
 *
 * Spring Boot 4 moved FlywayProperties into a separate autoconfigure module
 * (`spring-boot-flyway`) that is not on the classpath because this project
 * uses a custom JDBC datasource for Flyway while the app runs on R2DBC.
 * Only the settings actually used by [FlywayConfig] are declared here.
 */
@ConfigurationProperties(prefix = "spring.flyway")
data class FlywayMigrationProperties(
    val locations: List<String> = listOf("classpath:db/migration"),
    val baselineOnMigrate: Boolean = false
)
