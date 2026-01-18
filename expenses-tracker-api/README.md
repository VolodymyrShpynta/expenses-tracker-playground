# Expenses Tracker API

A fully reactive REST API for tracking expenses built with Spring WebFlux, Kotlin Coroutines, and R2DBC PostgreSQL.

## Features

- **Fully Reactive**: Built with Spring WebFlux and Kotlin Coroutines
- **PostgreSQL with R2DBC**: Non-blocking database access
- **REST API**: Simple endpoints for managing expenses

## Prerequisites

- Java 24
- PostgreSQL database
- Gradle 9.2.1+

## Database Setup

1. Create a PostgreSQL database:
```sql
CREATE DATABASE expenses_db;
```

2. Update the database connection settings in `src/main/resources/application.yaml`:
```yaml
spring:
  r2dbc:
    url: r2dbc:postgresql://localhost:5432/expenses_db
    username: postgres
    password: postgres
```

3. The schema will be automatically created on application startup via `schema.sql`

## Running the Application

```bash
./gradlew bootRun
```

The application will start on `http://localhost:8080`

## API Endpoints

### Add Expense
**POST** `/api/expenses`

Request body:
```json
{
  "description": "Groceries",
  "amount": 50.00,
  "category": "Food",
  "date": "2026-01-18T15:30:00"
}
```

Response (201 Created):
```json
{
  "id": 1,
  "description": "Groceries",
  "amount": 50.00,
  "category": "Food",
  "date": "2026-01-18T15:30:00"
}
```

### Get All Expenses
**GET** `/api/expenses`

Response (200 OK):
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

### Get Expense by ID
**GET** `/api/expenses/{id}`

Response (200 OK):
```json
{
  "id": 1,
  "description": "Groceries",
  "amount": 50.00,
  "category": "Food",
  "date": "2026-01-18T15:30:00"
}
```

## Testing with cURL

### Add an expense:
```bash
curl -X POST http://localhost:8080/api/expenses \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Groceries",
    "amount": 50.00,
    "category": "Food"
  }'
```

### Get all expenses:
```bash
curl http://localhost:8080/api/expenses
```

### Get expense by ID:
```bash
curl http://localhost:8080/api/expenses/1
```

## Running Tests

```bash
./gradlew test
```

Tests use an in-memory H2 database with R2DBC.

## Technology Stack

- **Kotlin 2.2.21**
- **Spring Boot 4.0.1**
- **Spring WebFlux** (Reactive web framework)
- **Spring Data R2DBC** (Reactive database access)
- **PostgreSQL with R2DBC driver**
- **Kotlin Coroutines** (For suspend functions)
- **JUnit 5** (Testing)

## Project Structure

```
expenses-tracker-api/
├── src/main/kotlin/com/vshpynta/expenses/api/
│   ├── controller/
│   │   └── ExpensesController.kt       # REST endpoints
│   ├── entity/
│   │   └── Expense.kt                   # Database entity
│   ├── repository/
│   │   └── ExpenseRepository.kt         # R2DBC repository
│   ├── dto/
│   │   └── ExpenseDto.kt                # Request/Response DTOs
│   └── ExpensesTrackerApiApplication.kt # Main application
├── src/main/resources/
│   ├── application.yaml                 # Application configuration
│   └── db/migration/
│       └── V1__Create_expenses_table.sql # Flyway migration
└── src/test/
    ├── kotlin/com/vshpynta/expenses/api/
    │   └── controller/
    │       └── ExpensesControllerTest.kt # Integration tests
    └── resources/
        ├── application-test.yaml         # Test configuration
        └── schema.sql                    # H2 test schema
```

