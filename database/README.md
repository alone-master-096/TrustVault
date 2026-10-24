# TrustVault Database Setup

TrustVault uses PostgreSQL through the backend database connection.

## Existing database

The current development project already has the following tables:

- users
- documents
- document_permissions
- audit_logs

The application also uses role and permission enums. Preserve the existing
schema when working with a database that already contains application data.

## Before setting up a fresh database

1. Create a PostgreSQL database.
2. Review the actual queries and table definitions used by the backend.
3. Create the required tables, enum types, constraints, and indexes.
4. Configure DATABASE_URL in backend/.env.
5. Start the backend and verify GET /api/health.
6. Run the backend test suite.

## Important

This repository does not yet contain a verified, complete schema migration.
Do not treat this document as executable SQL or use it to recreate an existing
database. A complete migration must be derived from the actual application
queries and the existing database schema before fresh-database setup can be
considered complete.
