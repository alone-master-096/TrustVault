# TrustVault Database Setup

TrustVault uses PostgreSQL through the backend connection configured by `DATABASE_URL`.

## Verified existing development schema

A read-only inspection of the configured database confirmed these public tables:

- `users`
- `documents`
- `document_permissions`
- `audit_logs`

The following PostgreSQL enum types were also confirmed:

- `user_role`: `admin`, `owner`, `viewer`
- `permission_type`: `read`, `edit`
- `audit_action`: `login`, `logout`, `upload`, `download`, `view`, `update`, `delete`, `permission_granted`, `permission_revoked`, `permission_changed`, `access_denied`

The inspected tables include primary keys and foreign keys. The `users.email` column is unique; `documents.storage_path` is unique; and `document_permissions` has a unique constraint named `unique_document_user_permission`.

The configured Supabase storage bucket `trustvault-documents` was found and is private.

## Local configuration

1. Configure `DATABASE_URL` in `backend/.env`.
2. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`.
3. Keep credentials private and ensure environment files remain untracked.
4. Start the backend and verify `GET /api/health`.
5. Run the backend test suite with `npm test` from the `backend` directory.

## Fresh database setup status

A complete, verified, executable schema migration is not yet included in this repository. The inspection above documents metadata from the existing database; it is not a migration script and does not contain every index, policy, trigger, or storage configuration detail that a reproducible deployment may require.

Do not run guessed `CREATE TABLE`, `DROP`, or destructive migration statements against an existing database. Before fresh installation can be considered reproducible, derive and review a migration from the actual backend queries and complete schema metadata, then test it against a separate empty database.

## Security notes

- Do not commit database URLs, Supabase service-role keys, JWT secrets, or user passwords.
- Keep document storage private.
- Enforce authorization in the backend for each document operation.
- Back up production data before applying reviewed migrations.
