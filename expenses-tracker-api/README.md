# Expenses Tracker API

A fully reactive REST API for expense tracking built with **Spring Boot 4**, **Kotlin Coroutines**, **R2DBC**, and **PostgreSQL**. This project demonstrates modern reactive programming patterns with production-ready configuration management and database migrations.

## 🎯 Project Overview

This application showcases a complete reactive stack implementation using the latest Spring Boot 4.0.1 with:
- **Reactive REST API** with Spring WebFlux
- **Non-blocking database access** with R2DBC
- **Kotlin Coroutines** for elegant asynchronous code
- **Database migrations** with Flyway
- **Production-ready configuration** using YAML properties

## 📑 Table of Contents

- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [Architecture](#-architecture)
- [Challenges & Solutions](#-challenges--solutions)
  - [Challenge 1: R2DBC + Flyway Integration](#challenge-1-r2dbc--flyway-integration)
  - [Challenge 2: HikariCP Property Naming](#challenge-2-hikaricp-property-naming)
  - [Challenge 3: H2 Case Sensitivity with R2DBC](#challenge-3-h2-case-sensitivity-with-r2dbc)
  - [Challenge 4: Testing Reactive Applications](#challenge-4-testing-reactive-applications)
  - [Challenge 5: H2 SQL Compatibility](#challenge-5-h2-sql-compatibility)
  - [Challenge 6: Gradle Version Catalog Setup](#challenge-6-gradle-version-catalog-setup)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
- [Running Tests](#-running-tests)
- [API Endpoints](#-api-endpoints)
- [Configuration](#️-configuration)
- [Development Tips](#-development-tips)
- [Troubleshooting](#-troubleshooting)
- [Key Learnings](#-key-learnings)
- [Next Steps](#-next-steps)

## ✨ Features

- ✅ **Fully Reactive Stack**: Spring WebFlux + Kotlin Coroutines + R2DBC
- ✅ **REST API**: CRUD operations for expense management
- ✅ **Database Migrations**: Flyway with PostgreSQL in production, H2 in tests
- ✅ **Reactive Testing**: WebTestClient with H2 in-memory database
- ✅ **Type-Safe Configuration**: Gradle Version Catalog for dependency management
- ✅ **Production-Ready**: Configuration-driven setup with environment profiles

## 🛠 Technology Stack

### Core Framework
- **[Spring Boot 4.0.1](https://spring.io/projects/spring-boot)** - Latest version with enhanced reactive support
- **[Kotlin 2.2.21](https://kotlinlang.org/)** - Modern JVM language with coroutines
- **[Java 24](https://openjdk.org/)** - Latest Java LTS with virtual threads support

### Reactive Stack
- **[Spring WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html)** - Reactive web framework
- **[Kotlin Coroutines](https://kotlinlang.org/docs/coroutines-overview.html)** - Structured concurrency for reactive code
- **[R2DBC](https://r2dbc.io/)** - Reactive database connectivity
  - Production: **[r2dbc-postgresql](https://github.com/pgjdbc/r2dbc-postgresql)** for PostgreSQL
  - Tests: **[r2dbc-h2](https://github.com/r2dbc/r2dbc-h2)** for in-memory H2

### Database & Migrations
- **[PostgreSQL](https://www.postgresql.org/)** - Production database
- **[H2 Database](https://www.h2database.com/)** - Test database (PostgreSQL compatibility mode)
- **[Flyway 11.16.0](https://flywaydb.org/)** - Database migration tool
- **[HikariCP](https://github.com/brettwooldridge/HikariCP)** - JDBC connection pool (for Flyway migrations)

### Build & Dependencies
- **[Gradle 9.2.1+](https://gradle.org/)** with Kotlin DSL
- **[Gradle Version Catalog](https://docs.gradle.org/current/userguide/platforms.html)** - Centralized dependency management
- **[Spring Dependency Management Plugin](https://docs.spring.io/dependency-management-plugin/docs/current/reference/html/)** - Version alignment

## 🏗 Architecture

### Reactive Flow
```
Client Request
    ↓
WebFlux Controller (suspend functions)
    ↓
R2DBC Repository (CoroutineCrudRepository)
    ↓
PostgreSQL (non-blocking I/O)
    ↓
Response (reactive stream)
```

### Dual Database Connectivity

The application uses **two separate database connections**:

1. **JDBC DataSource** (for Flyway migrations only)
   - Used at application startup
   - Runs database migrations
   - Blocking operations (acceptable during startup)
   
2. **R2DBC ConnectionFactory** (for application runtime)
   - Used for all CRUD operations
   - Non-blocking reactive queries
   - Full reactive stack

### Package Structure
```
com.vshpynta.expenses.api
├── config/              # Configuration classes
│   ├── FlywayConfig.kt           # Flyway setup for migrations
│   └── WebTestClientConfig.kt    # Test configuration
├── controller/          # REST controllers
│   └── ExpensesController.kt     # Expense endpoints
├── dto/                 # Data Transfer Objects
│   ├── ExpenseRequest.kt
│   └── ExpenseResponse.kt
├── entity/              # Database entities
│   └── Expense.kt               # R2DBC entity with @Table
├── repository/          # Data access layer
│   └── ExpenseRepository.kt     # CoroutineCrudRepository
└── ExpensesTrackerApiApplication.kt
```

## 🚧 Challenges & Solutions

### Challenge 1: R2DBC + Flyway Integration

**Problem**: Spring Boot's `DataSourceAutoConfiguration` is automatically excluded when R2DBC is detected on the classpath. This prevents Flyway (a JDBC-based tool) from running migrations.

**Why**: Spring Boot intentionally excludes JDBC DataSource auto-configuration in R2DBC applications to prevent accidental blocking calls in reactive code.

**Official References**:
- [Spring Boot R2DBC Documentation](https://docs.spring.io/spring-boot/reference/data/sql.html#data.sql.r2dbc)
- [Spring Data R2DBC Reference](https://docs.spring.io/spring-data/r2dbc/reference/)
- [Flyway with Spring Boot](https://flywaydb.org/documentation/usage/springboot)

**Solution**: 
- Created manual `FlywayConfig` class that explicitly defines a JDBC `DataSource` bean
- Used `@ConfigurationProperties` to read configuration from YAML files
- Flyway uses this JDBC DataSource for migrations at startup
- Application uses R2DBC for runtime queries

```kotlin
@Configuration
@EnableConfigurationProperties(FlywayConfigProperties::class)
class FlywayConfig {
    
    @Bean
    @ConfigurationProperties(prefix = "spring.flyway.datasource")
    fun flywayDataSource(): DataSource {
        return DataSourceBuilder.create().build()
    }

    @Bean(initMethod = "migrate")
    fun flyway(flywayDataSource: DataSource, flywayProperties: FlywayConfigProperties): Flyway {
        return Flyway.configure()
            .dataSource(flywayDataSource)
            .locations(*flywayProperties.locations.toTypedArray())
            .baselineOnMigrate(flywayProperties.baselineOnMigrate)
            .load()
    }
}
```

**Configuration** (`application.yaml`):
```yaml
spring:
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/expenses_db
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
    datasource:
      jdbc-url: jdbc:postgresql://localhost:5432/expenses_db  # Note: jdbc-url, not url
      username: postgres
      password: postgres
      driver-class-name: org.postgresql.Driver
```

**Key Points**:
- ✅ Official Spring Boot pattern for R2DBC + Flyway
- ✅ Configuration-driven (no hardcoded values)
- ✅ Works in production and tests
- ✅ No conflicts between JDBC and R2DBC

---

### Challenge 2: HikariCP Property Naming

**Problem**: Build failed with `IllegalArgumentException at HikariConfig.java:1087` when using `url` property.

**Why**: Spring Boot's default JDBC connection pool (HikariCP) uses `jdbc-url` instead of the standard `url` property name.

**Official Reference**: [HikariCP Configuration](https://github.com/brettwooldridge/HikariCP#gear-configuration-knobs-baby)

**Solution**: Change property from `url:` to `jdbc-url:` in YAML configuration.

```yaml
# ❌ Wrong - causes HikariCP error
spring.flyway.datasource.url: jdbc:postgresql://...

# ✅ Correct - HikariCP property name
spring.flyway.datasource.jdbc-url: jdbc:postgresql://...
```

---

### Challenge 3: H2 Case Sensitivity with R2DBC

**Problem**: Tests failed with "Table 'expenses' not found (candidates are: 'EXPENSES')".

**Why**: 
- H2 creates unquoted identifiers in UPPERCASE by default
- R2DBC generates quoted identifiers in lowercase
- `"expenses"` ≠ `"EXPENSES"` in H2

**Official Reference**: [H2 PostgreSQL Compatibility Mode](https://www.h2database.com/html/features.html#compatibility)

**Solution**: Use H2's PostgreSQL compatibility mode with `DATABASE_TO_LOWER=TRUE`:

```yaml
spring:
  r2dbc:
    url: r2dbc:h2:mem:///testdb;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE
  flyway:
    datasource:
      jdbc-url: jdbc:h2:mem:testdb;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE
```

**Additional**: Added explicit `@Column` annotations to entity:

```kotlin
@Table("expenses")
data class Expense(
    @Id
    @Column("id")
    val id: Long? = null,
    @Column("description")
    val description: String,
    @Column("amount")
    val amount: BigDecimal,
    @Column("category")
    val category: String,
    @Column("date")
    val date: LocalDateTime = LocalDateTime.now()
)
```

---

### Challenge 4: Testing Reactive Applications

**Problem**: `WebTestClient` bean was not auto-configured in tests, causing `NoSuchBeanDefinitionException`.

**Why**: Spring Boot 4 with `@SpringBootTest` requires explicit configuration when using WebFlux.

**Official Reference**: [Spring WebFlux Testing](https://docs.spring.io/spring-framework/reference/testing/webtestclient.html)

**Solution**: Created `WebTestClientConfig` test configuration:

```kotlin
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
```

Import in test class:
```kotlin
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(WebTestClientConfig::class)
@ActiveProfiles("test")
class ExpensesControllerTest {
    @Autowired
    private lateinit var webTestClient: WebTestClient
    // ...
}
```

---

### Challenge 5: H2 SQL Compatibility

**Problem**: Migration script with `BIGSERIAL` (PostgreSQL) didn't work in H2 tests.

**Why**: `BIGSERIAL` is PostgreSQL-specific syntax.

**Official References**:
- [PostgreSQL Data Types](https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL)
- [SQL:2011 Standard Identity Columns](https://en.wikipedia.org/wiki/Identity_column)

**Solution**: Used SQL standard syntax that works in both:

```sql
-- ✅ Works in both PostgreSQL and H2 (PostgreSQL mode)
CREATE TABLE IF NOT EXISTS expenses (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    description VARCHAR(500) NOT NULL,
    amount NUMERIC(19, 2) NOT NULL,
    category VARCHAR(100) NOT NULL,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

### Challenge 6: Gradle Version Catalog Setup

**Problem**: Managing dependency versions across multiple modules.

**Official Reference**: [Gradle Version Catalogs](https://docs.gradle.org/current/userguide/platforms.html#sub:version-catalog)

**Solution**: Created `gradle/libs.versions.toml` for centralized version management:

```toml
[versions]
java = "24"
kotlin = "2.2.21"
spring-boot = "4.0.1"
flyway = "11.16.0"

[libraries]
spring-boot-starter-webflux = { module = "org.springframework.boot:spring-boot-starter-webflux" }
# ... more dependencies

[plugins]
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
spring-boot = { id = "org.springframework.boot", version.ref = "spring-boot" }
```

**Benefits**:
- ✅ Single source of truth for versions
- ✅ Type-safe accessors in build scripts
- ✅ Consistent versions across modules
- ✅ Easy to update dependencies



## 📋 Prerequisites

- **Java 24** (or compatible JDK)
- **PostgreSQL 12+**
- **Gradle 9.2.1+** (or use included wrapper)

## 🚀 Getting Started

### 1. Database Setup

Create a PostgreSQL database:
```sql
CREATE DATABASE expenses_db;
```

### 2. Configuration

Update database credentials in `src/main/resources/application.yaml`:
```yaml
spring:
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/expenses_db
    username: postgres
    password: postgres
  flyway:
    datasource:
      jdbc-url: jdbc:postgresql://localhost:5432/expenses_db
      username: postgres
      password: postgres
```

### 3. Run the Application

Using Gradle wrapper:
```bash
./gradlew bootRun
```

Or on Windows:
```bash
.\gradlew.bat bootRun
```

The application will start on `http://localhost:8080`

**What happens on startup**:
1. Flyway runs database migrations (creates `expenses` table)
2. Spring Boot starts reactive Netty server
3. R2DBC connection pool initialized
4. REST endpoints available

### 4. Verify Setup

Check if the application is running:
```bash
curl http://localhost:8080/actuator/health
```

Expected response:
```json
{"status":"UP"}
```

## 🧪 Running Tests

### Run all tests:
```bash
./gradlew test
```

### Run specific test class:
```bash
./gradlew test --tests ExpensesControllerTest
```

### Run with verbose output:
```bash
./gradlew test --info
```

**Test Setup**:
- Tests use H2 in-memory database (PostgreSQL compatibility mode)
- Flyway migrations run automatically for each test
- Database is fresh for each test class
- WebTestClient configured for reactive testing

### Build the project:
```bash
./gradlew build
```

This will:
1. Compile Kotlin code
2. Run all tests
3. Create executable JAR file
4. Generate test reports



## 📡 API Endpoints

All endpoints return JSON and use reactive streams (non-blocking).

### Add Expense
```http
POST /api/expenses
Content-Type: application/json
```

**Request Body:**
```json
{
  "description": "Groceries",
  "amount": 50.00,
  "category": "Food",
  "date": "2026-01-18T15:30:00"
}
```

**Response** (201 Created):
```json
{
  "id": 1,
  "description": "Groceries",
  "amount": 50.00,
  "category": "Food",
  "date": "2026-01-18T15:30:00"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Groceries",
    "amount": 50.00,
    "category": "Food",
    "date": "2026-01-18T15:30:00"
  }'
```

---

### Get All Expenses
```http
GET /api/expenses
```

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "description": "Groceries",
    "amount": 50.00,
    "category": "Food",
    "date": "2026-01-18T15:30:00"
  },
  {
    "id": 2,
    "description": "Gas",
    "amount": 40.00,
    "category": "Transportation",
    "date": "2026-01-18T16:00:00"
  }
]
```

**cURL Example:**
```bash
curl http://localhost:8080/api/expenses
```

---

### Get Expense by ID
```http
GET /api/expenses/{id}
```

**Response** (200 OK):
```json
{
  "id": 1,
  "description": "Groceries",
  "amount": 50.00,
  "category": "Food",
  "date": "2026-01-18T15:30:00"
}
```

**Response** (404 Not Found):
```json
{
  "timestamp": "2026-01-18T15:30:00",
  "status": 404,
  "error": "Not Found",
  "message": "Expense with id 999 not found"
}
```

**cURL Example:**
```bash
curl http://localhost:8080/api/expenses/1
```

---

## ⚙️ Configuration

### Production (`application.yaml`)

```yaml
spring:
  application:
    name: expenses-tracker-api
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/expenses_db
    username: postgres
    password: postgres
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
    datasource:
      jdbc-url: jdbc:postgresql://localhost:5432/expenses_db
      username: postgres
      password: postgres
      driver-class-name: org.postgresql.Driver
```

### Test (`application-test.yaml`)

```yaml
spring:
  r2dbc:
    url: r2dbc:h2:mem:///testdb;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE
    username: sa
    password:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
    datasource:
      jdbc-url: jdbc:h2:mem:testdb;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE
      username: sa
      password:
      driver-class-name: org.h2.Driver
```

## 💡 Development Tips

### Working with Kotlin Coroutines

Controller methods use `suspend` for reactive behavior:

```kotlin
@PostMapping
@ResponseStatus(HttpStatus.CREATED)
suspend fun addExpense(@RequestBody request: ExpenseRequest): ExpenseResponse {
    val expense = Expense(...)
    val savedExpense = expenseRepository.save(expense)
    return savedExpense.toResponse()
}
```

### Adding New Migrations

1. Create new migration file: `src/main/resources/db/migration/V2__Add_new_column.sql`
2. Follow naming convention: `V{version}__{description}.sql`
3. Migrations run automatically on startup
4. Never modify existing migrations!

## 🔍 Troubleshooting

### Issue: "Table not found"
**Solution**: Check that Flyway migrations ran successfully and database exists.

### Issue: "HikariConfig error"
**Solution**: Use `jdbc-url` instead of `url` in datasource configuration.

### Issue: "WebTestClient bean not found"
**Solution**: Import `WebTestClientConfig` in your test class.

## 📚 Key Learnings

1. **R2DBC + Flyway**: Manual JDBC DataSource for Flyway is the official Spring Boot pattern
2. **HikariCP**: Use `jdbc-url` instead of `url` when configuring HikariCP
3. **H2 Compatibility**: Use PostgreSQL mode with `DATABASE_TO_LOWER=TRUE`
4. **Configuration-Driven**: Always prefer YAML configuration over hardcoded values
5. **Reactive Testing**: Use `WebTestClient` with proper configuration

## 🚀 Next Steps

- [ ] Add pagination to GET /api/expenses
- [ ] Implement filtering by category and date range
- [ ] Add update and delete endpoints
- [ ] Add Swagger/OpenAPI documentation
- [ ] Implement Docker deployment

---

**Built with** ❤️ **using Spring Boot 4, Kotlin, and R2DBC**
