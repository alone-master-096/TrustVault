# TrustVault API Reference

## Base URL

Local development: `http://localhost:5000`

All API paths below include their full `/api` prefix. Protected endpoints require a bearer token unless stated otherwise.

## Authentication

Send the token in the HTTP header:

`Authorization: Bearer <token>`

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public route; see registration validation in controller | Register a user |
| POST | `/api/auth/login` | Public | Authenticate and obtain login response/token |
| GET | `/api/auth/me` | Authenticated | Return the current user's profile |

`GET /api/auth/me` returns a `user` object. It returns `404 USER_NOT_FOUND` if the user record is missing and `403 ACCOUNT_DISABLED` if the account is disabled.

## Documents

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/documents` | Authenticated | List documents available to the current user |
| POST | `/api/documents/upload` | Authenticated | Upload a document; passes through upload middleware |
| GET | `/api/documents/:id/download` | Authenticated and authorized for read access | Download a document |
| DELETE | `/api/documents/:id` | Authenticated; handler enforces deletion rules | Soft-delete a document |

Replace `:id` with the document UUID.

The download handler checks current read access before accessing the private storage bucket. The owner can access their own document; active read or edit grants allow reading according to the permission service. Denied downloads are intended to be audited as access denials.

The upload request's exact multipart field names and validation limits must be checked in `backend/src/documents/document.controller.ts` before constructing a client request.

## Document permissions

These routes share the `/api/documents` mount prefix.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/documents/:id/permissions` | Authenticated; controller applies permission rules | Grant document permission |
| DELETE | `/api/documents/:id/permissions` | Authenticated; controller applies permission rules | Revoke document permission |

The permission service supports `read` and `edit`. An edit grant also permits reading. Revocation marks the permission inactive; access checks must use current database permission state.

The exact request body fields and all controller-level owner checks must be verified in `backend/src/permissions/permission.controller.ts`.

## User search

| Method | Endpoint | Access | Query parameters |
|---|---|---|---|
| GET | `/api/users/search` | Authenticated; role must be `owner` or `admin` | `q` — at least 2 characters |

The query is trimmed and limited to 100 characters. The endpoint searches active users by name or email, excludes the current user, and returns at most 20 results as `{ "users": [...] }`. A query shorter than two characters returns `400 SEARCH_QUERY_TOO_SHORT`.

## Administration

Both admin endpoints require authentication and a role of `admin` or `owner`.

| Method | Endpoint | Query parameters | Purpose |
|---|---|---|---|
| GET | `/api/admin/users` | Optional `q`; trimmed and limited to 100 characters | Search active users by name or email; maximum 50 results |
| GET | `/api/admin/audit` | Optional `limit` and `offset` | Retrieve audit records, newest first |

`GET /api/admin/users` returns `{ "users": [...] }`.

`GET /api/admin/audit` defaults to `limit=50` and `offset=0`; `limit` is capped at 100 and `offset` at 1,000,000. It returns `auditLogs` and a `pagination` object.

Note: the current route middleware permits both `admin` and `owner` roles for these endpoints. Do not describe them as admin-only unless the implementation is changed and verified.

## Health check

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Report API/database health |

The health handler returns a service status and reports a database failure with HTTP 503.

## Error handling and security

Clients should handle authentication failures, authorization denials, validation errors, missing resources, and server/database errors.

- Enforce authorization on the backend for every protected operation.
- Do not rely on hidden frontend controls as access control.
- Keep the Supabase service-role key server-side.
- Keep document storage private.
- Verify revocation by attempting a subsequent request with the revoked user's token.
- Do not assume every endpoint has identical error response shapes.

## Verification still required

- Confirm registration/login request and response schemas in the authentication controller.
- Confirm upload multipart field names, size/type limits, and response schema.
- Confirm permission grant/revoke request bodies and controller-level ownership checks.
- Exercise all endpoints with multiple real users and roles.
- Verify audit records for successful and denied actions.
- Test the documented behavior against a fresh database and a deployed environment before claiming production readiness.
