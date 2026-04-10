---
applyTo: "expenses-tracker-api/**"
---

# Backend Module — Kotlin + Spring Boot 4 Reactive Stack

These rules apply when working on files under `expenses-tracker-api/`.

---

## Backend Stack

- **Language**: Kotlin 2.3+
- **Framework**: Spring Boot 4.0+ (Spring Framework 7)
- **Web**: Spring WebFlux (reactive, non-blocking)
- **Data**: Spring Data R2DBC (reactive) + PostgreSQL
- **Migrations**: Flyway (via JDBC datasource — R2DBC is not supported by Flyway)
- **Serialization**: Jackson with Kotlin module
- **Build**: Gradle Kotlin DSL with version catalog (`gradle/libs.versions.toml`)
- **Testing**: JUnit 5, Testcontainers, Mockito-Kotlin, kotlinx-coroutines-test, AssertJ, WebTestClient
- **Java**: 21+ (LTS — supported until 2030; do not use non-LTS releases such as 24 in production)

---

## Gradle & Version Catalog — Required Practices

### Always use the TOML version catalog

All dependency declarations **must** use `libs.versions.toml` aliases — never hard-code `group:artifact:version` in
`build.gradle.kts`.

```kotlin
// ✅ Good
implementation(libs.spring.boot.starter.webflux)

// ❌ Never
implementation("org.springframework.boot:spring-boot-starter-webflux:4.0.1")
```

### Version catalog structure

- **`[versions]`** — centralize all version numbers. Reference with `version.ref`.
- **`[libraries]`** — declare every dependency. Omit `version` when managed by the BOM / dependency management plugin.
- **`[plugins]`** — declare all Gradle plugins with `version.ref`.

### Dependency management — plugin vs native BOM

This project uses the `io.spring.dependency-management` Gradle plugin to import Spring's BOM. That is correct and fully
supported. Be aware that Gradle's **native BOM support** (`platform()`) is an equally valid modern alternative and is
increasingly preferred in the Gradle ecosystem:

```kotlin
// ✅ Native Gradle BOM (alternative — no plugin needed)
implementation(platform(libs.spring.boot.bom))

// ✅ Also fine — via io.spring.dependency-management plugin (current project approach)
// versions are managed automatically when the plugin is applied
implementation(libs.spring.boot.starter.webflux)
```

Do not mix both approaches in the same module.

### Gradle conventions

- Use `alias(libs.plugins.xxx)` for plugins — never raw plugin IDs with inline versions.
- Root `build.gradle.kts` applies shared plugins with `apply false` and configures `allprojects` (group, version,
  repositories).
- Each module's `build.gradle.kts` applies only the plugins it needs.
- Use `java.toolchain` to set the JDK version from the catalog:
  `languageVersion.set(JavaLanguageVersion.of(libs.versions.java.get().toInt()))`.

---

## Spring Boot 4 / Spring Framework 7 — Required Practices

### Reactive stack — WebFlux + R2DBC

This project uses the **fully reactive** stack. Do **not** mix in Spring MVC (spring-boot-starter-web) or blocking JPA.

- Controllers return `Flow<T>` (Kotlin coroutines) or `Flux<T>` / `Mono<T>` (Reactor).
- Repository layer extends `CoroutineCrudRepository` (reactive, coroutines-first).
- Service methods are `suspend` functions or return `Flow<T>`.
- Bridge Reactor ↔ Coroutines using `awaitFirst()`, `awaitFirstOrNull()`, `asFlow()` from `kotlinx-coroutines-reactor`.

### Coroutines-first controller style

Prefer Kotlin coroutines over raw Reactor types in controllers and services:

```kotlin
// ✅ Preferred — coroutines
@GetMapping("/{id}")
suspend fun getById(@PathVariable id: String): ResponseEntity<ExpenseDto> {
    ...
}

@GetMapping
fun getAll(): Flow<ExpenseDto> {
    ...
}

// ⚠️ Acceptable if needed — Reactor
@GetMapping
fun getAll(): Flux<ExpenseDto> {
    ...
}
```

> ⚠️ **Never declare a function `suspend` if it returns `Flow<T>`.**
> `Flow` is already cold and lazy — the function itself does no async work before returning it.
> Adding `suspend` is non-idiomatic, can mislead the WebFlux dispatcher, and signals a
> misunderstanding of structured concurrency.
>
> ```kotlin
> // ❌ Wrong — suspend + Flow is redundant and non-idiomatic
> suspend fun getAllExpenses(): Flow<ExpenseDto>
>
> // ✅ Correct — plain fun returning Flow
> fun getAllExpenses(): Flow<ExpenseDto>
> ```

### Non-blocking everywhere

- Never call blocking APIs (JDBC, `Thread.sleep`, blocking I/O) inside reactive pipelines.
- **Do NOT** use `withContext(Dispatchers.IO)` for R2DBC or Spring Data reactive operations — they are already
  non-blocking. R2DBC sends a query and suspends the coroutine without holding a thread, so wrapping in `Dispatchers.IO`
  only wastes a thread from the IO pool that sits idle during execution. Note: `@Transactional` context propagation
  works correctly either way (via `ReactorContext` bridging), but the extra dispatcher switch is unnecessary overhead.
- Only use `Dispatchers.IO` for truly blocking calls (e.g., file I/O, JDBC).
- Flyway is the one exception — it uses a separate **JDBC** `DataSource` bean (`flywayDataSource`), configured
  independently from the R2DBC datasource.

### Spring annotations

- Use `@RestController` + `@RequestMapping` for controllers.
- Use `@Service`, `@Repository`, `@Component`, `@Configuration` appropriately.
- Use `@Valid` on `@RequestBody` parameters to trigger Bean Validation.
- Use `@Transactional` for transactional service methods (Spring's R2DBC-aware `@Transactional`).
- Use `@ConfigurationProperties` with `data class` for type-safe configuration binding.
- Use `@EnableConfigurationProperties(...)` in `@Configuration` classes.

> ⚠️ **Never create a `@ConfigurationProperties` class that shadows Spring Boot's own
> auto-configured properties** (e.g., `spring.flyway.*`, `spring.r2dbc.*`).
> Doing so creates a parallel, potentially inconsistent binding.
> Inject Spring Boot's own properties class (e.g., `FlywayProperties`) instead,
> or bind only a custom sub-key (e.g., `spring.flyway.datasource.*`).

### Constructor injection (only)

Spring Boot 4 / Kotlin: always use **constructor injection** — never `@Autowired` fields.

```kotlin
// ✅ Good — primary constructor injection
@Service
class ExpenseCommandService(
    private val projectionRepository: ExpenseProjectionRepository,
    private val eventRepository: ExpenseEventRepository,
    private val timeProvider: TimeProvider
)

// ❌ Never
@Service
class ExpenseCommandService {
    @Autowired
    lateinit var projectionRepository: ExpenseProjectionRepository
}
```

### Jackson configuration

Spring Boot 4 ships with **Jackson 3.x** (`tools.jackson` group) for HTTP codec serialization — a separate ecosystem
from Jackson 2.x (`com.fasterxml.jackson`).

#### For HTTP / WebFlux codecs

- Jackson 3.x handles Kotlin data class serialization natively — no `KotlinModule` registration is needed for HTTP
  responses.
- Configure serialization behaviour via `spring.jackson.*` YAML — Spring Boot 4 applies these to the Jackson 3.x mapper
  automatically:
  ```yaml
  spring:
    jackson:
      default-property-inclusion: non_null
  ```
- `Jackson2ObjectMapperBuilderCustomizer` **does not exist** in Spring Boot 4 — it was part of the old Jackson 2.x
  autoconfigure layer. Do not use it.
- Do **not** define a `@Primary ObjectMapper` bean to customise HTTP serialization — it is a Jackson 2.x type and will
  not be picked up by WebFlux's Jackson 3.x codec chain.

> ⚠️ Jackson 3.x renamed some `SerializationFeature` constants from Jackson 2.x.
> For example, `spring.jackson.serialization.write-dates-as-timestamps` does **not** work in
> Spring Boot 4 / Jackson 3.x and will cause a startup failure. Verify any
> `spring.jackson.serialization.*` keys at runtime before adding them.

#### For non-HTTP Jackson 2.x usage

Spring Boot 4 no longer auto-registers a `com.fasterxml.jackson.databind.ObjectMapper` bean. If a component injects one
directly (e.g. a utility class for file/internal serialization), register it explicitly — intentionally *
*without `@Primary`** so it does not interfere with WebFlux codecs:

```kotlin
// ✅ Correct — explicit Jackson 2.x bean for non-HTTP use, not @Primary
@Bean
fun jackson2ObjectMapper(): ObjectMapper = ObjectMapper().registerKotlinModule()

// ❌ Wrong — @Primary would conflict with WebFlux's Jackson 3.x codec chain
@Bean
@Primary
fun objectMapper(): ObjectMapper = ObjectMapper().registerKotlinModule()
```

Use `registerKotlinModule()` (idiomatic extension function) — not `KotlinModule.Builder().build()` or `KotlinModule()`
directly. The builder is only warranted for advanced custom configuration.

### Application configuration

- Use `application.yaml` (not `.properties`) for configuration — prefer the `.yaml` extension (officially recommended by
  the YAML spec).
- Externalize secrets via environment variables with `${ENV_VAR:default}` syntax.
- Use separate profiles for test (`application-test.yaml`).
- Always configure the R2DBC connection pool explicitly — never rely on defaults:
  ```yaml
  spring:
    r2dbc:
      pool:
        initial-size: 5
        max-size: 20
        max-idle-time: 30m
        validation-query: SELECT 1
  ```

---

## Kotlin Best Practices — Required Practices

### Idiomatic Kotlin

- **Data classes** for DTOs, entities, and value objects. Leverage `copy()` for immutable updates.
- **val over var** — prefer immutable references. Use `var` only when mutation is truly needed.
- **Null safety** — use Kotlin's null type system (`?`, `?.`, `?:`, `!!` sparingly). Avoid `!!` — prefer
  `requireNotNull()`, `checkNotNull()`, or `?: throw`.
- **Expression body** — use single-expression function syntax for short functions:
  ```kotlin
  fun now(): LocalDateTime = LocalDateTime.now()
  ```
- **when expressions** — prefer `when` over `if-else` chains for multi-branch logic.
- **String templates** — use `"Hello, $name"` instead of concatenation.
- **Scope functions** — use `let`, `apply`, `also`, `run`, `with` appropriately. Don't nest them deeply.
- **Extension functions** — use for cross-cutting utility logic (e.g., DTO mapping).
- **Sealed classes/interfaces** — prefer over enums when variants carry data.
- **Named arguments** — use when calling functions with many parameters or boolean flags.
- **Default parameter values** — prefer over overloading.
- **Destructuring declarations** — use for data classes and pairs where it improves clarity.

### Kotlin + Spring conventions

- Use `kotlin-spring` plugin (open classes for Spring proxying).
- Use `-Xjsr305=strict` for proper nullability from Java annotations.
- Use `-Xannotation-default-target=param-property` so annotations on `data class` constructor parameters apply to both
  the parameter and the backing property. This means `@field:` use-site target is typically not needed for Bean
  Validation, but **prefer explicit `@field:`** for clarity and portability:
  ```kotlin
  data class CreateRequest(
      @field:NotBlank(message = "Name is required")
      val name: String
  )
  ```

### Object declarations for stateless utilities

Use `object` for stateless mapper/utility classes containing extension functions:

```kotlin
object ExpenseMapper {
    fun ExpenseProjection.toDto(): ExpenseDto {
        ...
    }
}
```

### Coroutines

- Use `suspend` for one-shot async operations.
- Use `Flow<T>` for streaming / multi-value async operations.
- Use `runTest` from `kotlinx-coroutines-test` in tests.
- Avoid `runBlocking` in production code.

---

## Backend Architecture & Project Structure

```
expenses-tracker-api/src/main/kotlin/com/vshpynta/expenses/api/
├── ExpensesTrackerApiApplication.kt   # @SpringBootApplication entry point
├── config/                            # @Configuration classes (Flyway, R2DBC, Jackson, etc.)
├── controller/                        # @RestController — thin, delegates to service
│   ├── dto/                           # Request/Response data classes
│   └── GlobalExceptionHandler.kt      # @RestControllerAdvice — maps exceptions to HTTP statuses
├── model/                             # Domain entities (@Table data classes) and value types
├── repository/                        # CoroutineCrudRepository interfaces
├── service/                           # Business logic (suspend / Flow)
│   ├── ExpenseMapper.kt               # Shared mapping object (DRY — single source of truth)
│   └── sync/                          # File-based sync logic
└── util/                              # Cross-cutting utilities (TimeProvider, etc.)
```

### Layer responsibilities

- **Controller** — HTTP concerns only: routing, request validation (`@Valid`), response mapping, status codes. Keep
  thin — no business logic. **All entity→DTO mapping must go through `ExpenseMapper` — never define mapping functions
  inside a controller.**
- **Service** — business logic, orchestration, transactions. Returns domain entities.
- **Repository** — data access. Extend `CoroutineCrudRepository`. Add custom query methods with `@Query` as needed.
- **DTO** — input/output shapes inside `controller/dto/`. Use `data class` with Bean Validation annotations (
  `@field:NotBlank`, `@field:NotNull`).
- **Model** — domain entities mapped to database tables. Use `@Table`, `@Id`.
- **Config** — Spring `@Configuration` and `@ConfigurationProperties` classes.

### Event Sourcing & CQRS

This project uses event sourcing with CQRS:

- **Write side** — `ExpenseCommandService` creates events and projects them to the read model.
- **Read side** — `ExpenseQueryService` reads from projections.
- **Conflict resolution** — last-write-wins based on timestamps (idempotent UPSERT with `updated_at` comparison).
- Events are immutable once created. Entities implement `Persistable<UUID>` for correct R2DBC insert behavior.

### Testability

- **TimeProvider class** — inject time instead of calling `System.currentTimeMillis()` directly. This enables
  deterministic tests.
- **Constructor injection** — all dependencies injected via constructors for easy mocking.

---

## Database Migrations

- Flyway migrations in `src/main/resources/db/migration/`.
- Follow naming: `V{version}__{description}.sql` (double underscore).

---

## Logging

- Declare loggers in a `companion object` using SLF4J's `LoggerFactory`:
  ```kotlin
  @Service
  class ExpenseCommandService(...) {
      companion object {
          private val logger = LoggerFactory.getLogger(ExpenseCommandService::class.java)
      }
  }
  ```
- Use **structured logging with named placeholders** — never string interpolation or concatenation:
  ```kotlin
  // ✅ Good — lazy, structured, no string allocation unless level is enabled
  logger.info("Creating expense: description={}, amount={}", description, amount)

  // ❌ Never — allocates string regardless of log level
  logger.info("Creating expense: description=$description, amount=$amount")
  ```
- Use appropriate log levels: `TRACE`/`DEBUG` for diagnostic detail, `INFO` for normal operations, `WARN` for
  recoverable issues, `ERROR` for failures that need attention.
- **Never log sensitive data** — no passwords, tokens, full card numbers, or PII.
- In `@RestControllerAdvice` handlers: log expected domain errors at `DEBUG`, unexpected errors at `ERROR`.

---

## Backend Error Handling

- Use a `@RestControllerAdvice` (`GlobalExceptionHandler`) to centralize exception-to-HTTP-status mapping.
- Use standard or custom exception classes (e.g., `NoSuchElementException`) with descriptive messages.
- Controllers throw domain exceptions — the global handler maps them to HTTP status codes:
    - `NoSuchElementException` → 404 Not Found
    - `WebExchangeBindException` (validation) → 400 Bad Request
    - `IllegalArgumentException` → 400 Bad Request
    - `DataAccessException` → 503 Service Unavailable (log at ERROR level)
    - `Exception` (catch-all, **must be defined last**) → 500 Internal Server Error (log at ERROR level, never expose
      internal details to the client)
- Return structured error responses (`mapOf("error" to message)`).
- Use `ResponseEntity` in the exception handler to control status codes explicitly.

---

## Containerisation — Dockerfile

- **Base image**: always use a **Java 21 LTS** image (e.g., `amazoncorretto:21-alpine`). Never use a non-LTS Java
  release (e.g., 24) — it goes EOL after 6 months.
- **Multi-stage layered build**: use Spring Boot's `jarmode=layertools` to extract layers in a builder stage, then copy
  each layer in the final stage. This maximises Docker layer cache reuse and keeps the final image small.
- **`WORKDIR`** — always use `WORKDIR /app` to set the working directory. Never use `RUN mkdir`.
- **Non-root user** — always create and switch to a non-root user before the `ENTRYPOINT`. Running as root inside a
  container is a security risk.
- **`ENTRYPOINT`** over `CMD` — use `ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]` with a
  layered build. Avoid `CMD ["java", "-jar", "app.jar"]` as it bypasses layers.

```dockerfile
# ✅ Good — multi-stage layered build, non-root, LTS Java
FROM amazoncorretto:21-alpine AS builder
WORKDIR /app
COPY build/libs/app.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

FROM amazoncorretto:21-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /app/dependencies/ ./
COPY --from=builder /app/spring-boot-loader/ ./
COPY --from=builder /app/snapshot-dependencies/ ./
COPY --from=builder /app/application/ ./
USER appuser
EXPOSE 8080
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```
