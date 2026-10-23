# TrustVault API Reference

## Purpose
This document describes the API routes identified in the current source.
The document router is defined in `backend/src/documents/document.routes.ts`.
Confirm the router mount prefix in the application entry point before using
the relative paths below as complete URLs.

## Authentication
Protected routes use the `authenticate` middleware. Supply a valid bearer
token in the HTTP Authorization header:

`Authorization: Bearer <token>`

The server must enforce authorization on every request. Hiding a button in
the frontend is not an access-control mechanism.

## Document routes

| Method | Relative path | Purpose | Access |
|---|---|---|---|
| GET | `/` | List documents available to the authenticated user | Authenticated user; returned documents must be access-scoped |
| POST | `/upload` | Upload a document | Authenticated user; validate file and metadata |
| DELETE | `/:id` | Soft-delete a document | Owner-only behavior is implemented in the current handler; deletion audit must be verified |
| GET | `/:id/download` | Download a document | Authenticated user with current read access, or owner |

These paths are relative to the document router, not necessarily the API root.

## Permissions
Permission routes are defined in
`backend/src/permissions/permission.routes.ts`.
The service supports `read` and `edit` permission types, grants and revokes
access, and writes permission-related audit records. Consult the route file
for the exact HTTP methods, paths, request schemas and middleware.

## Administration
Administrative routes are defined in
`backend/src/admin/admin.routes.ts`. Consult that file for exact paths,
required role checks, query parameters and response schemas. Administrative
activity data must not be exposed to ordinary users.

## Error handling
Clients should handle authentication failures, authorization denials,
missing documents, validation errors, and server/database failures.
Do not treat a hidden UI control as proof that a request is authorized.

## Verification still required
- Document every route and its exact role/permission requirements.
- Verify read and edit grants against every relevant route.
- Verify access revocation immediately blocks subsequent requests.
- Verify denied access attempts and document changes are audited.
- Verify deletion and administrative activity records.
- Add request/response examples based on the actual implementation.
