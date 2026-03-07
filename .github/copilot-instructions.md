# Copilot Instructions — Expenses Tracker

These instructions apply to every Copilot session in this workspace.
Backend-specific rules live in path-specific instruction files
under `.github/instructions/` and are merged automatically when editing matching files.

---

## Project Overview

**Expenses Tracker** is a backend expense tracking application with event sourcing and CQRS.

- **Monorepo** managed by Gradle with a version catalog (`gradle/libs.versions.toml`)
- **Backend** — Kotlin + Spring Boot 4 (WebFlux / R2DBC reactive stack)
- **Database** — PostgreSQL (R2DBC for app, JDBC for Flyway migrations)
- **Testing** — JUnit 5 / Testcontainers (backend)

### Key Commands

```bash
# Build everything
./gradlew build

# Backend only
./gradlew :expenses-tracker-api:build
./gradlew :expenses-tracker-api:bootRun

# Run all tests
./gradlew test
```

---

## Clean Code Principles (All Modules)

### SOLID Principles

- **Single Responsibility (SRP)** — each class, component, or utility should have one reason to change. If something handles HTTP concerns + data fetching + validation, split it.
- **Open/Closed (OCP)** — design for extension, not modification. Prefer interfaces/abstractions.
- **Liskov Substitution (LSP)** — subtypes must be substitutable for their base types.
- **Interface Segregation (ISP)** — keep interfaces small and focused. No client should depend on methods it does not use.
- **Dependency Inversion (DIP)** — depend on abstractions, not concretions. Use constructor injection.

### DRY — Don't Repeat Yourself

- Every piece of knowledge should have a single, unambiguous representation.
- Extract shared logic into reusable functions, components, or utility classes.
- Avoid copy-pasting code blocks — find the common abstraction.

### KISS — Keep It Simple

- Prefer the simplest solution that works.
- Don't add abstractions until complexity demands it.
- Extract complex boolean expressions into well-named variables or helpers.

### YAGNI — You Aren't Gonna Need It

- Don't add features, parameters, or abstractions until they are actually needed.
- Avoid speculative generality — build for today's requirements.

### Boy Scout Rule

- Always leave the code cleaner than you found it.
- When touching existing code: improve naming, remove dead code, fix minor issues.
- Keep refactoring separate from feature changes when possible.

### Meaningful Names

- Use **descriptive, pronounceable, searchable** names.
- Avoid single-letter variables except in short lambdas.
- Use **consistent vocabulary** — pick one word per concept (e.g., always `find`, not sometimes `get` and sometimes `retrieve`).
- Add meaningful context when needed (`expenseCount`, not just `count`).

### Small Functions

- Keep functions/methods to **10–20 lines** where possible.
- Each function should operate at a **single level of abstraction**.
- Limit parameters — ideally **0–2**; use a data class / options object for more.
- Avoid flag/boolean arguments that change behaviour — split into two functions.

### Comments

- Write **self-documenting code** — comments should explain **why**, not **what**.
- **Good**: legal notices, complex algorithm explanations, TODO with context, non-obvious decisions.
- **Bad**: redundant comments that repeat the code, commented-out code (use version control), misleading or outdated comments.

### Error Handling

- Prefer **throwing exceptions** over returning null or silent failures.
- Provide meaningful context in error messages.
- Handle errors at the appropriate boundary.

### Low Cyclomatic Complexity

- Use **guard clauses / early returns** to reduce nesting.
- Extract complex conditions into well-named helper functions.
- Aim for **no more than 2 levels of indentation** inside a function body.
- Avoid nested loops — extract into helpers or use functional operations.

### Separation of Concerns

- **Presentation** — controllers
- **Business logic** — services
- **Data access** — repositories
- **Mapping / transformation** — dedicated mappers or utility functions
- **Configuration** — separate config classes / constants files

### Test Pyramid

- Favour **unit tests** (fast, many) over integration tests (moderate) over E2E tests (few).
- Each test should follow **Arrange → Act → Assert** (Given / When / Then).
- Test behaviour, not implementation details.
- Use meaningful test names that describe the scenario and expected outcome.

### Design Patterns

- Choose patterns based on the problem, not the other way around.
- Don't over-engineer with patterns when simple solutions suffice.
- Common applicable patterns: Factory, Strategy, Repository, Builder, Observer.

### Dependency Management

- Only include dependencies you actually need.
- Regularly review and remove unused packages.
- Use **dependency injection** to promote loose coupling and testability.

### Logging

- Use appropriate log levels (TRACE/DEBUG/INFO/WARN/ERROR).
- Use structured logging with named parameters — not string interpolation.
- **Never log** sensitive data (passwords, tokens, PII).
- Include correlation context (IDs) in log messages.

---

## General Coding Rules

- Always check for compile/lint errors after edits.
- Prefer reading enough context before editing — don't guess file structure.
- When multiple independent edits are needed, batch them where possible.
- Keep files focused — extract when a class has too many responsibilities.

