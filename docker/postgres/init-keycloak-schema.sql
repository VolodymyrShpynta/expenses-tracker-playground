-- Create the keycloak schema so Keycloak can store its tables separately
-- from application tables in the same database.
CREATE SCHEMA IF NOT EXISTS keycloak;
