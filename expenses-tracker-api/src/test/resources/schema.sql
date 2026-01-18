-- Test database schema for H2
DROP TABLE IF EXISTS "expenses";

CREATE TABLE "expenses" (
    "id" BIGINT AUTO_INCREMENT PRIMARY KEY,
    "description" VARCHAR(500) NOT NULL,
    "amount" DECIMAL(19, 2) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "date" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_expenses_category" ON "expenses"("category");
CREATE INDEX "idx_expenses_date" ON "expenses"("date");

