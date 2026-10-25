# TrustVault Validation Plan

## Purpose
Use this checklist to validate the application against the TrustVault
challenge. Record actual outcomes; do not mark a test passed merely because
the frontend hides an action or the project compiles.

## Build and test baseline

Observed on 2026-10-25 from the reported PowerShell output:

- Backend tests: 33 passed, 0 failed.
- Backend TypeScript production build: passed.
- Frontend production build: passed.

These are local test/build results, not proof of deployed end-to-end
authorization. Repeat these checks after subsequent source changes.

## Authentication and roles
- [ ] Missing, malformed and expired tokens are rejected.
- [ ] Disabled or deleted accounts cannot continue using stale tokens.
- [ ] The database's current role controls authorization.
- [ ] Viewer, owner and administrator permissions are tested independently.

## Document isolation
Create two users and separate documents for each.

- [ ] User B cannot list User A's private document.
- [ ] User B cannot download it by guessing or substituting its ID.
- [ ] User B cannot edit its metadata or content.
- [ ] User B cannot delete it.
- [ ] A read-only recipient cannot perform edit operations.
- [ ] A revoked recipient cannot use a previously valid grant.
- [ ] Direct API requests receive the same protections as UI actions.

## Upload validation
- [ ] Valid supported file uploads succeed.
- [ ] Unsupported extensions and MIME types are rejected.
- [ ] Oversized files are rejected.
- [ ] Invalid metadata and malformed identifiers are rejected.
- [ ] Failed database or audit transactions do not leave inconsistent files.
- [ ] Stored files are not publicly accessible without authorization.

## Audit trail
- [ ] Uploads, downloads, edits, deletions and permission changes are recorded.
- [ ] Denied attempts are recorded with actor, document where known, time and outcome.
- [ ] Audit records are written reliably when a transaction fails.
- [ ] Ordinary users cannot modify or delete audit records.
- [ ] Administrators can view the permitted activity information.
- [ ] The audit interface itself enforces administrator authorization.

## Search
- [ ] Search by document name.
- [ ] Filter by owner.
- [ ] Filter by category.
- [ ] Filter by date.
- [ ] Search results remain restricted to documents the caller may access.

## Operational checks
- [ ] A clean clone can be configured using documented instructions.
- [ ] Database schema and migrations apply successfully.
- [ ] Required environment variables are documented without publishing secrets.
- [ ] Live deployment is reachable and seeded accounts work.
- [ ] API documentation matches the registered routes.
- [ ] Five-minute demo and technical write-up are ready.

## Result recording
For each test, record date, environment, exact request/action, expected
result, actual result, and pass/fail. Never place real passwords, bearer
tokens or other secrets in this document.
