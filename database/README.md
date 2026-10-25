# TrustVault Database Setup

TrustVault uses PostgreSQL through the backend connection configured by `DATABASE_URL`.

## Schema file

The repository includes [`schema.sql`](schema.sql), a clean-install schema derived from read-only inspection of the existing development database.

It defines the five tables:

- `users`
- `documents`
- `document_permissions`
- `audit_logs`
- `password_reset_codes`

It also defines the `user_role`, `permission_type`, and `audit_action` enums, observed constraints and indexes, automatic `updated_at` triggers, and audit-log modification protection.

**Validation status:** the schema file has been created but has not yet been executed against a separate empty PostgreSQL database. Do not describe it as independently tested or production-ready until that validation succeeds.

## Fresh database setup

1. Create a separate, empty PostgreSQL database for testing.
2. Configure a connection to that database without overwriting the existing `backend/.env`.
3. Review `schema.sql` before running it.
4. Execute the schema against the empty test database only.
5. Verify the tables, enum types, constraints, indexes, and triggers.
6. Run the backend tests and verify the application against the test database.
7. Configure the private Supabase Storage bucket separately. Creating PostgreSQL tables does not create or configure the storage bucket.

The SQL includes a guard against existing TrustVault tables and enum types. This is a precaution, not a substitute for selecting the correct database. Never run this clean-install file against the existing development or production database.

## Local configuration

1. Configure `DATABASE_URL` in `backend/.env`.
2. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`.
3. Keep credentials private and ensure environment files remain untracked.
4. Start the backend and verify `GET /api/health`.
5. Run the backend test suite with `npm test` from the `backend` directory.

## Seed accounts

A reproducible seed script and verified demo-account credentials have not yet been established by this database setup work. Do not publish real passwords, password hashes, or production credentials. Create demo accounts using the application's supported account-creation flow or a reviewed seed process.

## Security notes

- Do not commit database URLs, Supabase service-role keys, JWT secrets, or user passwords.
- Keep document storage private.
- Enforce authorization in the backend for each document operation.
- Back up production data before applying reviewed migrations.
