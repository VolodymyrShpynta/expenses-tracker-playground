package com.vshpynta.expenses.api.config

import org.flywaydb.core.Flyway
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.jdbc.DataSourceBuilder
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import javax.sql.DataSource

@Configuration
@EnableConfigurationProperties(FlywayConfigProperties::class)
class FlywayConfig {

    @Bean
    @ConfigurationProperties(prefix = "spring.flyway.datasource")
    fun flywayDataSource(): DataSource {
        return DataSourceBuilder.create().build()
    }

    @Bean(initMethod = "migrate")
    fun flyway(
        flywayDataSource: DataSource,
        flywayProperties: FlywayConfigProperties
    ): Flyway {
        return Flyway.configure()
            .dataSource(flywayDataSource)
            .locations(*flywayProperties.locations.toTypedArray())
            .baselineOnMigrate(flywayProperties.baselineOnMigrate)
            .load()
    }
}

@ConfigurationProperties(prefix = "spring.flyway")
data class FlywayConfigProperties(
    var enabled: Boolean = true,
    var locations: List<String> = listOf("classpath:db/migration"),
    var baselineOnMigrate: Boolean = false
)
