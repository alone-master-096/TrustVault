# TrustVault Threat Model

## 1. Purpose and security objectives

TrustVault is a secure document-sharing application. Its security objectives are confidentiality, integrity, availability, least-privilege access, revocable sharing, and accountable document operations.

## 2. Assets to protect

- Uploaded document contents and stored files.
- User identities, password hashes, authentication tokens, and account status.
- Document ownership and per-document permissions.
- Audit events, including successful and denied operations.
- Database credentials, storage credentials, and signing secrets.
- Document metadata and search results.

## 3. Trust boundaries

- Browser to frontend application.
- Frontend to backend API.
- Backend API to database.
- Backend API to file/object storage.
- Administrative operations versus ordinary user operations.

The backend must enforce authorization independently of frontend visibility or client-supplied role information.

## 4. Threats and mitigations

| Threat | Required mitigation and verification |
|---|---|
| Unauthenticated document access | Require authentication on protected endpoints; test missing, invalid, expired, and revoked credentials. |
| Insecure direct object reference (IDOR) | Check the authenticated user's ownership or active document grant for every document-specific operation. Test with two distinct users and document IDs. |
| Privilege escalation | Derive roles from trusted server-side account data; reject caller-supplied role assignments. |
| Stale permission after revocation | Check current permissions on every protected request; test access immediately after revocation. |
| Unauthorized download | Authorize before retrieving or streaming file contents; test both permitted and denied downloads. |
| Unauthorized edit or deletion | Enforce the required permission and ownership policy in the backend, not only in the UI. |
| Malicious or oversized upload | Validate file type, size, and content; use safe filenames and prevent path traversal. |
| Audit tampering or missing events | Restrict audit-log writes and access; record security-sensitive operations consistently. Test failure handling for permission changes and audit writes. |
| Sensitive information in logs | Avoid logging passwords, bearer tokens, secrets, or document contents. |
| Credential or secret exposure | Keep secrets in environment configuration; do not commit real credentials to source control. |
| Database or storage outage | Fail closed for authorization checks; avoid granting access when a security dependency is unavailable. |
| Cross-site scripting or request abuse | Apply appropriate output handling, security headers, input validation, and origin/CSRF protections where applicable. |

## 5. Authorization policy

- A user must not gain access merely by guessing a document ID.
- Document owners may grant and revoke access according to the application policy.
- Viewers must not receive edit or delete privileges.
- Revoked grants must not authorize subsequent requests.
- Administrative privileges must be explicit and server-enforced.
- Denied access attempts should be audited where the system can safely record the event.
- Authorization failures must not disclose protected document contents.

## 6. Audit requirements

Audit events should identify the actor, action, target document or permission, timestamp, outcome, and relevant request context where available. Do not include secrets or document contents. Protect audit records against unauthorized alteration and deletion.

## 7. Security verification plan

- Test that unauthenticated requests are rejected.
- Test that one user cannot list, read, download, edit, or delete another user's documents without an authorized grant.
- Test that viewer access cannot perform write operations.
- Test grant and revocation behavior, including audit transaction failures.
- Test upload validation and storage cleanup behavior.
- Test denied-operation audit records and administrative audit access.
- Run backend tests and production builds before release.

## 8. Residual risks and release checks

This document defines the threat model and verification plan; it is not proof that every mitigation is implemented. Review actual routes, middleware, storage configuration, database policies, deployment settings, and tests before claiming a control is complete. Confirm production secrets, HTTPS, backups, dependency updates, and account provisioning before deployment.
