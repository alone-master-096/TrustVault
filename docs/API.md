# TrustVault API Reference

## Base URL

Local: `http://localhost:5000`

Production: `https://trustvault-api-i1ya.onrender.com`

Application endpoints use the `/api` prefix unless stated otherwise.

## Authentication

Protected endpoints require:

`Authorization: Bearer <token>`

Obtain the token through login. Never publish tokens, passwords, or service credentials.

## General and Authentication Endpoints

| Method | Endpoint | Access | Success |
|---|---|---|---|
| GET | `/` | Public | 200 |
| GET | `/api/health` | Public | 200 when database is reachable; 503 otherwise |
| POST | `/api/auth/register` | Public | 201 |
| POST | `/api/auth/login` | Public | 200 |
| POST | `/api/auth/forgot-password` | Public | 200 |
| POST | `/api/auth/reset-password` | Public | 200 |
| GET | `/api/auth/me` | Authenticated | 200 |

### Password reset request

`POST /api/auth/forgot-password`

Request body:

```json
{
  "email": "user@example.com"
}
```

The email must be valid and no longer than 255 characters. A successful response does not disclose whether an account exists. Rate limiting may return 429; unavailable email configuration may return 503.

### Complete password reset

`POST /api/auth/reset-password`

Request body:

```json
{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "ReplaceWithAStrongPassword"
}
```

The code must contain six digits. The password must contain 8–100 characters. The code must be valid and unexpired.

Registration and login request schemas are defined in `backend/src/auth/auth.types.ts`. Consult that file for their exact fields and validation rules.

## Documents

| Method | Endpoint | Access | Success |
|---|---|---|---|
| GET | `/api/documents` | Authenticated | 200 |
| POST | `/api/documents/upload` | Authenticated | 201 |
| GET | `/api/documents/:id/download` | Authenticated plus document read permission | 200 with file bytes |
| DELETE | `/api/documents/:id` | Authenticated; owner only | 200 |

### Upload a document

`POST /api/documents/upload`

Use `multipart/form-data` with these fields:

- `file`: required file, maximum 10 MB.
- `name`: required, trimmed, 1–200 characters.
- `description`: optional, maximum 1,000 characters.
- `category`: optional, maximum 100 characters.

Accepted MIME types are PDF, plain text, PNG, JPEG, and DOCX. The backend also checks file content. A successful response returns the created document object.

Possible validation errors include `FILE_REQUIRED`, `INVALID_FILE_CONTENT`, `INVALID_METADATA`, and `UNSUPPORTED_FILE_TYPE`.

### List documents

`GET /api/documents`

Returns a JSON object containing a `documents` array for the authenticated user.

### Download a document

`GET /api/documents/:id/download`

Requires a valid document UUID and current read access. Returns the file as an attachment. An invalid ID returns 400, denied access returns 403, and a missing document returns 404.

### Delete a document

`DELETE /api/documents/:id`

Only the document owner can delete it. Deletion is a soft delete; the record is marked deleted rather than immediately removed from the database. Invalid IDs return 400. Missing documents and non-owner attempts return 404.

## Document Permissions

| Method | Endpoint | Access | Success |
|---|---|---|---|
| POST | `/api/documents/:id/permissions` | Authenticated; owner authorization enforced by service | 201 |
| DELETE | `/api/documents/:id/permissions` | Authenticated; owner authorization enforced by service | 200 |

### Grant permission

`POST /api/documents/:id/permissions`

JSON request body:

```json
{
  "userId": "00000000-0000-4000-8000-000000000000",
  "permission": "read"
}
```

Replace the example UUID with the recipient's actual user ID. `permission` must be `read` or `edit`. The owner cannot grant a permission to themselves. The recipient must exist and be active.

### Revoke permission

`DELETE /api/documents/:id/permissions`

JSON request body:

```json
{
  "userId": "00000000-0000-4000-8000-000000000000"
}
```

Replace the example UUID with the actual recipient ID. Revocation requires document ownership and an existing permission.

## User Search

| Method | Endpoint | Access | Success |
|---|---|---|---|
| GET | `/api/users/search?q=<query>` | Authenticated owner/admin | 200 |

The query must contain at least two characters. Results include active users matching name or email, exclude the current user, and are limited to 20 results.

## Administration

| Method | Endpoint | Access | Success |
|---|---|---|---|
| GET | `/api/admin/users?q=<query>` | Authenticated admin/owner | 200 |
| GET | `/api/admin/audit?limit=50&offset=0` | Authenticated admin/owner | 200 |

The admin user list is limited to 50 results. The audit endpoint returns `auditLogs` and pagination information. The default limit is 50, the maximum is 100, and the offset is capped at 1,000,000.

## Error Handling

Common status codes:

- `400`: invalid request, validation failure, or malformed ID.
- `401`: missing or invalid authentication.
- `403`: authenticated but not permitted to perform an operation.
- `404`: resource or account not found, or deliberately concealed by the authorization policy.
- `409`: registration email already exists.
- `429`: password-reset rate limit reached.
- `500`: unexpected server error.
- `502`: password-reset email delivery failed.
- `503`: database unavailable or email provider not configured.

Actual response bodies depend on the endpoint and error condition. See the corresponding controller for the authoritative behavior.

## Security Notes

- Keep JWT secrets, database credentials, and Supabase service-role keys private.
- Do not commit `.env` files or publish real access tokens.
- Document authorization must be enforced by the backend, not merely by the frontend.
- Documents are stored in a private Supabase Storage bucket.
- Verify access grants and revocation with separate accounts before release.

## Verification Status

This reference is based on the inspected route registrations and controllers. It documents implementation behavior but does not prove every endpoint works end to end. Run automated tests and verify deployed multi-user scenarios before claiming complete release readiness.
## Route Registration and Authorization Clarifications

The following routes were checked against the backend route registrations:

| Method | Endpoint | Registered handler and access |
|---|---|---|
| POST | `/api/auth/register` | Public registration |
| POST | `/api/auth/login` | Public login |
| POST | `/api/auth/forgot-password` | Public password-reset request |
| POST | `/api/auth/reset-password` | Public password-reset completion |
| GET | `/api/auth/me` | Authenticated; rejects disabled accounts |
| GET | `/api/documents` | Authenticated document listing |
| POST | `/api/documents/upload` | Authenticated upload |
| GET | `/api/documents/:id/download` | Authenticated; document read access checked by the download handler |
| DELETE | `/api/documents/:id` | Authenticated; ownership enforced by the delete handler |
| POST | `/api/documents/:id/permissions` | Authenticated; ownership enforced by the permission service |
| DELETE | `/api/documents/:id/permissions` | Authenticated; ownership enforced by the permission service |
| GET | `/api/users/search?q=<query>` | Authenticated; owner/admin role required by the users route |
| GET | `/api/admin/users?q=<query>` | Authentication and admin/owner role required by router middleware |
| GET | `/api/admin/audit?limit=50&offset=0` | Authentication and admin/owner role required by router middleware |

The `/api/documents` and `/api/users` route groups are mounted by `backend/src/server.ts`. The `/api/admin` and `/api/auth` groups are also mounted there. The current-user endpoint `/api/auth/me` is registered directly in the server.

This table describes the inspected route registrations. It is not a substitute for automated or deployed end-to-end authorization tests.

