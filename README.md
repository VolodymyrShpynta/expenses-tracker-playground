# Expenses Tracker Playground

A fully reactive expense tracking application built with **Spring Boot 4**, **Kotlin Coroutines**, **R2DBC**, and **PostgreSQL**. This project demonstrates modern reactive programming patterns with production-ready configuration management, database migrations, and Docker deployment.

## 📑 Table of Contents

- [Project Overview](#-project-overview)
- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [Architecture](#-architecture)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development Setup](#local-development-setup)
  - [Running Tests](#running-tests)
- [Docker Deployment](#-docker-deployment)
  - [Quick Start](#quick-start)
  - [Docker Commands](#docker-commands)
  - [Environment Variables](#environment-variables)
- [API Documentation](#-api-documentation)
  - [Endpoints](#endpoints)
  - [Examples](#examples)
- [Configuration](#️-configuration)
  - [Application Properties](#application-properties)
  - [Environment Variables Guide](#environment-variables-guide)
- [Challenges & Solutions](#-challenges--solutions)
- [Development Guide](#-development-guide)
- [Troubleshooting](#-troubleshooting)
- [References](#-references)

## 🎯 Project Overview

This application showcases a complete reactive stack implementation using the latest Spring Boot 4.0.1 with:
- **Reactive REST API** with Spring WebFlux
- **Non-blocking database access** with R2DBC
- **Kotlin Coroutines** for elegant asynchronous code
- **Database migrations** with Flyway
- **Docker containerization** with Docker Compose
- **Custom environment variables** for configuration
- **Production-ready** setup with health checks and monitoring

## ✨ Features

- ✅ **Fully Reactive Stack**: Spring WebFlux + Kotlin Coroutines + R2DBC
- ✅ **REST API**: CRUD operations for expense management
- ✅ **Database Migrations**: Flyway with PostgreSQL (production) and H2 (tests)
- ✅ **Reactive Testing**: WebTestClient with H2 in-memory database
- ✅ **Type-Safe Configuration**: Gradle Version Catalog for dependency management
- ✅ **Docker Support**: Complete Docker Compose setup with PostgreSQL
- ✅ **Custom Environment Variables**: `EXPENSES_TRACKER_*` prefixed configuration
- ✅ **Production-Ready**: Health checks, monitoring, and proper error handling

## 🛠 Technology Stack

### Core Framework
- **[Spring Boot 4.0.1](https://spring.io/projects/spring-boot)** - Latest version with enhanced reactive support
- **[Kotlin 2.2.21](https://kotlinlang.org/)** - Modern JVM language with coroutines
- **[Java 24](https://openjdk.org/)** - Latest Java with virtual threads support

### Reactive Stack
- **[Spring WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html)** - Reactive web framework
- **[Kotlin Coroutines](https://kotlinlang.org/docs/coroutines-overview.html)** - Structured concurrency
- **[R2DBC](https://r2dbc.io/)** - Reactive database connectivity
  - Production: **[r2dbc-postgresql](https://github.com/pgjdbc/r2dbc-postgresql)**
  - Tests: **[r2dbc-h2](https://github.com/r2dbc/r2dbc-h2)**

### Database & Migrations
- **[PostgreSQL 16](https://www.postgresql.org/)** - Production database
- **[H2 Database](https://www.h2database.com/)** - Test database (PostgreSQL compatibility mode)
- **[Flyway 11.16.0](https://flywaydb.org/)** - Database migration tool
- **[HikariCP](https://github.com/brettwooldridge/HikariCP)** - JDBC connection pool

### Build & Deployment
- **[Gradle 9.2.1+](https://gradle.org/)** with Kotlin DSL
- **[Gradle Version Catalog](https://docs.gradle.org/current/userguide/platforms.html)** - Centralized dependency management
- **[Docker](https://www.docker.com/)** - Containerization
- **[Docker Compose](https://docs.docker.com/compose/)** - Multi-container orchestration

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

1. **JDBC DataSource** (Flyway migrations only)
   - Used at application startup
   - Runs database migrations
   - Blocking operations (acceptable during startup)
   
2. **R2DBC ConnectionFactory** (Application runtime)
   - Used for all CRUD operations
   - Non-blocking reactive queries
   - Full reactive stack

### Project Structure
```
expenses-tracker-playground/
├── expenses-tracker-api/              # Main application module
│   ├── src/main/
│   │   ├── kotlin/                    # Kotlin source code
│   │   └── resources/
│   │       ├── application.yaml       # Main configuration
│   │       └── db/migration/          # Flyway migrations
│   ├── src/test/                      # Tests
│   ├── Dockerfile                     # Docker image definition
│   └── build.gradle.kts               # Module build config
├── gradle/
│   └── libs.versions.toml             # Version catalog
├── docker-compose.yml                 # Docker services definition
├── .env.example                       # Environment variables template
├── build.gradle.kts                   # Root build config
├── settings.gradle.kts                # Multi-module setup
└── README.md                          # This file
```

## 🚀 Getting Started

### Prerequisites

- **Java 24** (or compatible JDK)
- **PostgreSQL 12+** (or use Docker)
- **Gradle 9.2.1+** (or use included wrapper)
- **Docker & Docker Compose** (optional, for containerized deployment)

### Local Development Setup

#### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd expenses-tracker-playground
```

#### 2. Database Setup (Without Docker)

If running locally without Docker, create PostgreSQL database:
```sql
CREATE DATABASE expenses_db;
```

Configure credentials in `expenses-tracker-api/src/main/resources/application.yaml`:
```yaml
spring:
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/expenses_db
    username: postgres
    password: postgres
```

#### 3. Build the Project
```bash
./gradlew build
```

On Windows:
```bash
.\gradlew.bat build
```

#### 4. Run the Application
```bash
./gradlew :expenses-tracker-api:bootRun
```

The application will start on `http://localhost:8080`

**What happens on startup:**
1. Flyway runs database migrations (creates `expenses` table)
2. Spring Boot starts reactive Netty server
3. R2DBC connection pool initialized
4. REST endpoints available at port 8080

#### 5. Verify Setup
```bash
# Check health
curl http://localhost:8080/actuator/health

# Expected response
{"status":"UP"}
```

### Running Tests

```bash
# Run all tests
./gradlew test

# Run specific test class
./gradlew test --tests ExpensesControllerTest

# Run with verbose output
./gradlew test --info

# Build and test
./gradlew build
```

**Test Configuration:**
- Tests use H2 in-memory database (PostgreSQL compatibility mode)
- Flyway migrations run automatically for each test
- Fresh database for each test class
- WebTestClient configured for reactive testing

## 🐳 Docker Deployment

### Quick Start

**1. Build the JAR:**
```bash
./gradlew bootJar
```

The JAR will be created at: `expenses-tracker-api/build/libs/expenses-tracker-api-0.0.1-SNAPSHOT.jar`

**Why `bootJar`?**
- ✅ Creates executable fat JAR with all dependencies
- ✅ Spring Boot optimized (custom classloader)
- ✅ Can run with `java -jar`
- ✅ Perfect for Docker containers

**2. Start Services:**
```bash
docker-compose up -d
```

**What this does:**
- Starts PostgreSQL container (port 5432)
- Builds API Docker image
- Starts API container (port 8080)
- Flyway runs migrations automatically
- Creates Docker network for communication

**3. Verify Deployment:**
```bash
# Check health
curl http://localhost:8080/actuator/health

# Test API
curl http://localhost:8080/api/expenses

# View logs
docker-compose logs -f expenses-api
```

**4. Stop Services:**
```bash
# Stop services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Docker Commands

#### Build & Deploy
```bash
# Build JAR
./gradlew bootJar

# Start services
docker-compose up -d

# Start and rebuild images
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### Monitoring
```bash
# Check service status
docker-compose ps

# View API logs
docker-compose logs -f expenses-api

# View PostgreSQL logs
docker-compose logs -f postgres

# Check container resources
docker stats
```

#### Database Access
```bash
# Connect to PostgreSQL
docker exec -it expenses-db psql -U postgres -d expenses_db

# Run SQL query
docker exec -it expenses-db psql -U postgres -d expenses_db -c "SELECT * FROM expenses;"

# Backup database
docker exec expenses-db pg_dump -U postgres expenses_db > backup.sql

# Restore database
docker exec -i expenses-db psql -U postgres -d expenses_db < backup.sql
```

#### Debugging
```bash
# Access API container shell
docker exec -it expenses-api sh

# View environment variables
docker exec expenses-api env | grep EXPENSES_TRACKER

# Inspect container
docker inspect expenses-api
```

### Environment Variables

The application uses custom `EXPENSES_TRACKER_*` prefixed environment variables.

#### How It Works

The `docker-compose.yml` is configured to use environment variables from a `.env` file with sensible defaults:

```yaml
# Example from docker-compose.yml
POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
```

**Syntax:** `${VARIABLE:-default_value}`
- If `.env` file exists with `VARIABLE=value`, uses that value
- If no `.env` file or variable not set, uses `default_value`

#### Usage Options

**Option 1: Use Defaults (No Setup Required)**

Simply run without creating `.env` file:
```bash
docker-compose up -d
```

Uses these defaults:
- `POSTGRES_DB=expenses_db`
- `POSTGRES_USER=postgres`  
- `POSTGRES_PASSWORD=postgres`
- All app credentials use `postgres`

**Option 2: Use Custom Values (Recommended for Production)**

1. **Copy template:**
```bash
cp .env.example .env
```

2. **Edit with your values:**
```bash
# .env
POSTGRES_PASSWORD=my_secure_password
EXPENSES_TRACKER_R2DBC_PASSWORD=my_secure_password
EXPENSES_TRACKER_FLYWAY_PASSWORD=my_secure_password
```

3. **Start services:**
```bash
docker-compose up -d
```

Docker Compose automatically loads `.env` file from the project root!

**Option 3: Use Different .env Files for Different Environments**

```bash
# Development
docker-compose --env-file .env.dev up -d

# Staging
docker-compose --env-file .env.staging up -d

# Production
docker-compose --env-file .env.prod up -d
```

#### Complete Variable Reference

**PostgreSQL Configuration:**
```bash
POSTGRES_DB=expenses_db                    # Database name
POSTGRES_USER=postgres                     # Database user
POSTGRES_PASSWORD=postgres                 # Database password
```

**R2DBC Configuration (Reactive Connection):**
```bash
EXPENSES_TRACKER_R2DBC_URL=r2dbc:postgresql://postgres:5432/expenses_db
EXPENSES_TRACKER_R2DBC_USERNAME=postgres
EXPENSES_TRACKER_R2DBC_PASSWORD=postgres
```

**Flyway Configuration (Database Migrations):**
```bash
EXPENSES_TRACKER_FLYWAY_JDBC_URL=jdbc:postgresql://postgres:5432/expenses_db
EXPENSES_TRACKER_FLYWAY_USERNAME=postgres
EXPENSES_TRACKER_FLYWAY_PASSWORD=postgres
```

#### Verification

Check what values Docker Compose will use:
```bash
docker-compose config
```

Check running container environment:
```bash
docker exec expenses-api env | grep EXPENSES_TRACKER
```

#### Security Notes

- ✅ `.env` file is in `.gitignore` (won't be committed)
- ✅ `.env.example` is tracked (shows structure without secrets)
- ✅ Use strong passwords in production
- ✅ Different passwords for each environment
- ❌ Never commit `.env` file to version control

## 📡 API Documentation

### Endpoints

| Method | Endpoint | Description | Status Code |
|--------|----------|-------------|-------------|
| POST | `/api/expenses` | Create new expense | 201 Created |
| GET | `/api/expenses` | Get all expenses | 200 OK |
| GET | `/api/expenses/{id}` | Get expense by ID | 200 OK / 404 Not Found |
| GET | `/actuator/health` | Health check | 200 OK |

### Examples

#### Add Expense
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Groceries",
    "amount": 50.00,
    "category": "Food",
    "date": "2026-01-19T15:30:00"
  }'
```

**Response (201 Created):**
```json
{
  "id": 1,
  "description": "Groceries",
  "amount": 50.00,
  "category": "Food",
  "date": "2026-01-19T15:30:00"
}
```

#### Get All Expenses
```bash
curl http://localhost:8080/api/expenses
```

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "description": "Groceries",
    "amount": 50.00,
    "category": "Food",
    "date": "2026-01-19T15:30:00"
  },
  {
    "id": 2,
    "description": "Gas",
    "amount": 40.00,
    "category": "Transportation",
    "date": "2026-01-19T16:00:00"
  }
]
```

#### Get Expense by ID
```bash
curl http://localhost:8080/api/expenses/1
```

**Response (200 OK):**
```json
{
  "id": 1,
  "description": "Groceries",
  "amount": 50.00,
  "category": "Food",
  "date": "2026-01-19T15:30:00"
}
```

**Response (404 Not Found):**
```json
{
  "timestamp": "2026-01-19T15:30:00",
  "status": 404,
  "error": "Not Found",
  "message": "Expense with id 999 not found"
}
```

## ⚙️ Configuration

### Application Properties

#### Production (`application.yaml`)
```yaml
spring:
  application:
    name: expenses-tracker-api
  r2dbc:
    url: ${EXPENSES_TRACKER_R2DBC_URL:r2dbc:postgresql://localhost:5432/expenses_db}
    username: ${EXPENSES_TRACKER_R2DBC_USERNAME:postgres}
    password: ${EXPENSES_TRACKER_R2DBC_PASSWORD:postgres}
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
    datasource:
      jdbc-url: ${EXPENSES_TRACKER_FLYWAY_JDBC_URL:jdbc:postgresql://localhost:5432/expenses_db}
      username: ${EXPENSES_TRACKER_FLYWAY_USERNAME:postgres}
      password: ${EXPENSES_TRACKER_FLYWAY_PASSWORD:postgres}
      driver-class-name: org.postgresql.Driver
```

#### Test (`application-test.yaml`)
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

### Environment Variables Guide

#### Variable Naming Convention

All environment variables use the `EXPENSES_TRACKER_*` prefix for:
- ✅ Clear ownership (belongs to this application)
- ✅ No conflicts with other Spring Boot apps
- ✅ Self-documenting configuration
- ✅ Better for microservices architectures

#### Complete Variable Reference

| Variable | Description | Default Value |
|----------|-------------|---------------|
| `EXPENSES_TRACKER_R2DBC_URL` | R2DBC connection URL | `r2dbc:postgresql://localhost:5432/expenses_db` |
| `EXPENSES_TRACKER_R2DBC_USERNAME` | Database username for R2DBC | `postgres` |
| `EXPENSES_TRACKER_R2DBC_PASSWORD` | Database password for R2DBC | `postgres` |
| `EXPENSES_TRACKER_FLYWAY_JDBC_URL` | JDBC URL for Flyway migrations | `jdbc:postgresql://localhost:5432/expenses_db` |
| `EXPENSES_TRACKER_FLYWAY_USERNAME` | Database username for Flyway | `postgres` |
| `EXPENSES_TRACKER_FLYWAY_PASSWORD` | Database password for Flyway | `postgres` |

#### Usage in Different Environments

**Local Development:**
```bash
# Uses defaults from application.yaml
./gradlew bootRun
```

**Docker Compose:**
```yaml
# docker-compose.yml
environment:
  EXPENSES_TRACKER_R2DBC_URL: r2dbc:postgresql://postgres:5432/expenses_db
  EXPENSES_TRACKER_R2DBC_PASSWORD: ${DB_PASSWORD:-postgres}
```

**Kubernetes:**
```yaml
env:
  - name: EXPENSES_TRACKER_R2DBC_URL
    valueFrom:
      configMapKeyRef:
        name: expenses-config
        key: r2dbc.url
  - name: EXPENSES_TRACKER_R2DBC_PASSWORD
    valueFrom:
      secretKeyRef:
        name: expenses-secret
        key: db.password
```

**Direct Environment Variables:**
```bash
export EXPENSES_TRACKER_R2DBC_PASSWORD=secure_password
./gradlew bootRun
```

## 🚧 Challenges & Solutions

### Challenge 1: R2DBC + Flyway Integration

**Problem:** Spring Boot's `DataSourceAutoConfiguration` is automatically excluded when R2DBC is detected, preventing Flyway from running.

**Why:** Spring Boot intentionally excludes JDBC DataSource auto-configuration in R2DBC applications to prevent accidental blocking calls.

**Solution:** Created manual `FlywayConfig` that explicitly defines a JDBC DataSource bean for Flyway migrations while using R2DBC for runtime queries.

**References:**
- [Spring Boot R2DBC Documentation](https://docs.spring.io/spring-boot/reference/data/sql.html#data.sql.r2dbc)
- [Flyway with Spring Boot](https://flywaydb.org/documentation/usage/springboot)

### Challenge 2: HikariCP Property Naming

**Problem:** Build failed with `IllegalArgumentException at HikariConfig.java` when using `url` property.

**Why:** HikariCP uses `jdbc-url` instead of the standard `url` property name.

**Solution:** Changed property from `url:` to `jdbc-url:` in YAML configuration.

**Reference:** [HikariCP Configuration](https://github.com/brettwooldridge/HikariCP#gear-configuration-knobs-baby)

### Challenge 3: H2 Case Sensitivity with R2DBC

**Problem:** Tests failed with "Table 'expenses' not found (candidates are: 'EXPENSES')".

**Why:** H2 creates unquoted identifiers in UPPERCASE by default, but R2DBC generates quoted lowercase identifiers.

**Solution:** Used H2's PostgreSQL compatibility mode with `DATABASE_TO_LOWER=TRUE` and added explicit `@Column` annotations.

**Reference:** [H2 PostgreSQL Compatibility](https://www.h2database.com/html/features.html#compatibility)

### Challenge 4: Testing Reactive Applications

**Problem:** `WebTestClient` bean was not auto-configured in tests.

**Why:** Spring Boot 4 with `@SpringBootTest` requires explicit configuration for WebFlux.

**Solution:** Created `WebTestClientConfig` test configuration.

**Reference:** [Spring WebFlux Testing](https://docs.spring.io/spring-framework/reference/testing/webtestclient.html)

### Challenge 5: H2 SQL Compatibility

**Problem:** Migration script with `BIGSERIAL` (PostgreSQL) didn't work in H2 tests.

**Why:** `BIGSERIAL` is PostgreSQL-specific syntax.

**Solution:** Used SQL standard `BIGINT GENERATED BY DEFAULT AS IDENTITY` syntax that works in both.

### Challenge 6: Gradle Version Catalog Setup

**Problem:** Managing dependency versions across multiple modules.

**Solution:** Created `gradle/libs.versions.toml` for centralized version management.

**Reference:** [Gradle Version Catalogs](https://docs.gradle.org/current/userguide/platforms.html#sub:version-catalog)

## 💡 Development Guide

### Adding New Migrations

1. Create migration file: `src/main/resources/db/migration/V2__Add_new_column.sql`
2. Follow naming: `V{version}__{description}.sql`
3. Migrations run automatically on startup
4. **Never modify existing migrations!**

Example:
```sql
-- V2__Add_tags_column.sql
ALTER TABLE expenses ADD COLUMN tags VARCHAR(255);
CREATE INDEX idx_expenses_tags ON expenses(tags);
```

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

### Testing Reactive Code

Use `WebTestClient` for integration tests:

```kotlin
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(WebTestClientConfig::class)
@ActiveProfiles("test")
class ExpensesControllerTest {
    
    @Autowired
    private lateinit var webTestClient: WebTestClient
    
    @Test
    fun `should create expense`() {
        webTestClient.post()
            .uri("/api/expenses")
            .bodyValue(request)
            .exchange()
            .expectStatus().isCreated
            .expectBody()
            .jsonPath("$.id").exists()
    }
}
```

### Building for Production

```bash
# Create optimized JAR
./gradlew bootJar

# Build Docker image
docker build -t expenses-tracker-api:1.0.0 expenses-tracker-api/

# Run with production profile
java -jar expenses-tracker-api/build/libs/expenses-tracker-api-0.0.1-SNAPSHOT.jar \
  --spring.profiles.active=prod
```

## 🔍 Troubleshooting

### Issue: "Unable to get image" or "pipe/dockerDesktopLinuxEngine: The system cannot find the file"
**Cause:** Docker Desktop is not running.

**Solution:**
1. **Start Docker Desktop** on Windows/macOS
2. Wait until Docker Desktop is fully started (icon in system tray should be green)
3. Verify Docker is running:
```bash
docker ps
```
4. Then retry:
```bash
docker-compose up -d
```

### Issue: "Table not found"
**Solution:** Check that Flyway migrations ran successfully. View logs:
```bash
docker logs expenses-api | grep -i flyway
```

### Issue: "HikariConfig error"
**Solution:** Use `jdbc-url` instead of `url` in datasource configuration.

### Issue: "WebTestClient bean not found"
**Solution:** Import `WebTestClientConfig` in your test class:
```kotlin
@Import(WebTestClientConfig::class)
```

### Issue: Port already in use
```bash
# Find process using port 8080
lsof -i :8080  # macOS/Linux
netstat -ano | findstr :8080  # Windows

# Stop Docker services
docker-compose down
```

### Issue: Database connection failed
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Issue: Migration failed
```bash
# View Flyway logs
docker logs expenses-api | grep -i flyway

# Check migration history
docker exec -it expenses-db psql -U postgres -d expenses_db \
  -c "SELECT * FROM flyway_schema_history;"
```

## 📚 References

### Official Documentation
- [Spring Boot Reference](https://docs.spring.io/spring-boot/reference/)
- [Spring WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html)
- [Kotlin Coroutines](https://kotlinlang.org/docs/coroutines-overview.html)
- [R2DBC Specification](https://r2dbc.io/)
- [Spring Data R2DBC](https://docs.spring.io/spring-data/r2dbc/reference/)
- [Flyway Documentation](https://flywaydb.org/documentation/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [Gradle Documentation](https://docs.gradle.org/)

### Key Technologies
- [HikariCP Configuration](https://github.com/brettwooldridge/HikariCP)
- [H2 Database](https://www.h2database.com/)
- [Amazon Corretto](https://aws.amazon.com/corretto/)

### Best Practices
- [12-Factor App](https://12factor.net/)
- [Spring Boot Best Practices](https://spring.io/guides)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

## 🎯 Key Learnings

1. **R2DBC + Flyway:** Manual JDBC DataSource for Flyway is the official Spring Boot pattern for R2DBC applications
2. **HikariCP:** Always use `jdbc-url` (not `url`) when configuring HikariCP
3. **H2 Compatibility:** Use PostgreSQL mode with `DATABASE_TO_LOWER=TRUE` for consistent behavior
4. **Configuration-Driven:** Prefer YAML configuration with environment variables over hardcoded values
5. **Custom Variables:** Use application-specific prefixes (`EXPENSES_TRACKER_*`) for clarity and avoiding conflicts
6. **Reactive Testing:** Use `WebTestClient` with proper configuration for integration tests
7. **Docker Optimization:** Use `.dockerignore` and multi-stage builds for smaller images

## 🚀 Next Steps

- [ ] Add pagination to GET /api/expenses
- [ ] Implement filtering by category and date range
- [ ] Add update and delete endpoints
- [ ] Add Swagger/OpenAPI documentation
- [ ] Implement Spring Security for authentication
- [ ] Add metrics with Micrometer
- [ ] Set up CI/CD pipeline
- [x] ~~Implement Docker deployment~~ ✅ Complete!

## 📝 License

This project is part of the expenses-tracker-playground and is for educational purposes.

## 🤝 Contributing

This is a playground project for learning Spring Boot 4 + R2DBC + Kotlin patterns.

---

**Built with** ❤️ **using Spring Boot 4, Kotlin, R2DBC, and Docker**

**Version:** 0.0.1-SNAPSHOT  
**Last Updated:** January 2026
