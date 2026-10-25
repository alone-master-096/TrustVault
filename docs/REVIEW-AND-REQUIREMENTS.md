# TrustVault — PDF Requirements Review

This checklist follows the Snovasys Fresher Hiring Challenge 2026 brief.
A source file existing or a production build passing does not prove a
requirement works end to end.

## Ten functional requirements

| # | Requirement | Current evidence / remaining work |
|---|---|---|
| 1 | Authentication and administrator, owner, viewer roles | Authentication tests exist. Verify each role against the running application and document its allowed actions. |
| 2 | Upload, organise, search and manage documents | Upload and listing code exists. Verify organisation and all search filters in the UI and API. |
| 3 | Per-document read/edit permissions for named people | Permission service supports read/edit. Verify every relevant API route. |
| 4 | Owners grant and revoke access | Grant/revoke service and transaction tests exist. Verify ownership checks and immediate revocation. |
| 5 | Unauthorized users cannot read, download, change or delete | Download checks current access. Test all routes, including direct API requests and identifier substitution. |
| 6 | Audit uploads, downloads, changes, deletions and permission changes | Upload/download/permission audit logic exists in source. Deletion audit was not confirmed in the reviewed handler; verify before marking complete. |
| 7 | Search by name, owner, category and date | Category exists in source. Complete behavior for every required filter is not yet proven. |
| 8 | Validate uploaded files | Upload validation exists. Test invalid MIME types, extensions, sizes, malformed input and storage failures. |
| 9 | Administrative activity and permission-change view | Admin routes exist. Verify UI, role restrictions and event coverage. |
| 10 | Automated tests prove cross-user isolation | Current backend suite: 33 passed, 0 failed (latest reported local run). Expand attack tests and prove each protected route denies unauthorized users. |

## Required submission items

- [ ] Public Git repository with meaningful history across the week.
- [ ] Deployed live URL and seed credentials for administrator, owner and viewer.
- [x] `THREATS.md` exists; review it against the final implementation.
- [ ] `PROMPTS.md` has at least five dated, honest entries, including at least two on access control or auditing, with valid commit links.
- [ ] Automated authorization tests cover the threats documented in `THREATS.md`.
- [ ] Database schema, setup scripts and clean-clone deployment instructions verified.
- [ ] API documentation lists every endpoint and its access requirements.
- [ ] Five-minute demo video.
- [ ] Short write-up describing the permission model, omissions, AI use and unfinished work.

## Security acceptance criteria

1. The server authorizes every read, download, edit, delete and permission change.
2. Access is denied unless the current user owns the document or has the required active grant.
3. Revoking a grant immediately blocks subsequent requests.
4. Successful and denied access attempts are recorded in the audit trail.
5. Audit records are protected against unauthorized alteration.
6. Automated tests fail if a required authorization check is removed.

## Build verification already observed

On 2026-10-23, the reported local run showed 26 backend tests passing, the backend TypeScript build passing and the frontend production build passing. These results are not a substitute for live security testing or deployment verification.
