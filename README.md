# TrustVault

TrustVault is a document-sharing application with authenticated access, document ownership, per-document read/edit permissions, document downloads, and audit logging.

## Verified project status

The following checks passed in the local development environment on the most recent verification run:

- Backend automated tests: 33 passed, 0 failed.
- Backend production TypeScript build: passed.
- Frontend production Next.js build: passed.
- Local backend root, backend health endpoint, and frontend root: HTTP 200.
- PostgreSQL metadata inspection: `users`, `documents`, `document_permissions`, and `audit_logs` exist.
- Supabase storage inspection: `trustvault-documents` exists and is configured as private.
- Git working tree was clean before the documentation update.

These results verify local builds and the existing automated tests. They do not establish that the application has been deployed or that every end-to-end security scenario has been tested.

## Requirements

- Node.js and npm compatible with the lockfiles.
- A PostgreSQL database.
- Supabase project credentials and a private storage bucket named `trustvault-documents`.
- Backend and frontend environment configuration.

## Local development

Keep secrets in ignored local environment files. Never commit real credentials.

### Backend

Open PowerShell:

```powershell
Set-Location 'C:\Users\P Suneetha\trustvault\backend'
npm ci
npm test
npm run build
npm run dev
```

The development API is expected at `http://localhost:5000` when using the local configuration.

### Frontend

Open a second PowerShell window:

```powershell
Set-Location 'C:\Users\P Suneetha\trustvault\frontend'
npm ci
npm run build
npm run dev
```

The development frontend is expected at `http://localhost:3000` when using the local configuration.

## Environment configuration

Use `.env.example` as a reference only. Configure the actual values in local environment files:

- `backend/.env`: database URL, Supabase URL, Supabase service-role key, JWT secret, and backend frontend-origin configuration.
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL`, normally `http://localhost:5000/api` for local development.

Do not paste secrets into issues, logs, documentation, or source control. The Supabase service-role key must remain server-side.

## Database

The repository includes [`database/schema.sql`](database/schema.sql), a clean-install schema based on read-only inspection of the existing development database. See [`database/README.md`](database/README.md) for setup instructions and validation limitations.

The schema has not yet been tested against a separate empty PostgreSQL database. Do not run it against an existing development or production database. Seed/demo-account creation and independent schema validation remain outstanding.

## Documentation

- [API reference](docs/API.md)
- [Threat model](THREATS.md)
- [AI prompt log](PROMPTS.md)
- [Requirements review](docs/REVIEW-AND-REQUIREMENTS.md)
- [Validation checklist](docs/VALIDATION.md)

## Remaining release work

Before describing the project as fully submission-ready, verify and complete the challenge's required deliverables:

- A reproducible database migration for a fresh installation.
- Exact API documentation checked against route implementations.
- Real multi-user end-to-end authorization and revocation tests.
- Deployment URL and working deployment verification, if required.
- Seed/demo accounts created securely and documented without publishing real passwords.
- The required demonstration video, if applicable.

Do not claim an outstanding item is complete until it has been implemented and verified.

## Project Demo

Watch the TrustVault website demonstration: https://youtu.be/IZCrGb6hGNc

