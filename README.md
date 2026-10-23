# TrustVault — reviewed source bundle

This source bundle is based on the supplied TrustVault debug ZIP and the Snovasys Fresher Hiring Challenge 2026 specification. It is not a claim that the project has been deployed or passed a build in this environment.

## Local development

1. Keep your real environment variables in untracked `backend/.env`; never commit it.
2. Configure the database schema from your actual Supabase/PostgreSQL project. The supplied ZIP did not include SQL schema/migrations, so this bundle does not invent a potentially incompatible schema.
3. In one PowerShell window:

   ```powershell
   Set-Location 'C:\Users\P Suneetha\trustvault\backend'
   npm ci
   npm test
   npm run build
   npm run dev
   ```

4. In another PowerShell window:

   ```powershell
   Set-Location 'C:\Users\P Suneetha\trustvault\frontend'
   npm ci
   npm run build
   npm run dev
   ```

5. Set `NEXT_PUBLIC_API_URL` for the frontend deployment and `FRONTEND_URL` for the backend deployment to the actual deployed origin.

## Important

- No `.env` or credentials are included.
- `docs/REVIEW-AND-REQUIREMENTS.md` lists changes and remaining PDF requirements.
- `docs/API.md` documents the current routes.
- `docs/VALIDATION.md` contains required local validation and manual security checks.
- Metadata editing is implemented for owners and active edit grantees. File-content replacement/versioning, database schema/setup SQL, deployed URL, seed credentials, full end-to-end authorization tests, and demo video remain incomplete/unverified. Do not submit these as complete until they are actually implemented and verified.
