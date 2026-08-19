# HYMN Distribution Automation Audit

Date: 2026-06-12

## 1. Architecture Audit Report

Frontend: Next.js App Router with React 19 client components, Tailwind CSS, and local component modules. The release submission experience is primarily `components/release-form.tsx`; dashboards live in `components/release-portal.tsx` and `components/admin-control-center.tsx`.

Backend: Next.js route handlers under `app/api`. Distribution submission currently uses `app/api/distribution/payment/*`, `save-draft`, `update-release`, and admin status routes.

Database: Two persistence paths exist. `prisma/schema.prisma` targets PostgreSQL, while the active custom distribution helpers in `lib/distribution-db.ts` use MySQL via `mysql2` when `DATABASE_URL` is MySQL and an in-memory fallback otherwise. `db/schema.sql` is the current MySQL schema.

Authentication: User sessions use JWT cookies via `lib/session.ts`; admin access can come from a signed-in admin user or local admin cookie. Admin checks use `requireAdmin()`.

File storage: `lib/storage.ts` writes uploads to `./public/uploads` by default and returns web paths such as `/uploads/releases/audio/file.wav`. Distributor delivery requires these to become absolute public URLs via `PUBLIC_SITE_URL`/request origin.

Artist system: `artist_profiles` and `ArtistPicker` support saved artist profiles with Spotify/Apple metadata. The current release payload stores primary/featured artists as strings and profile IDs are only touched for freshness.

Release system: Existing release model captures title, artist, release type, genre, language, territory, artwork/audio, platforms, payment state, queue position, and legal confirmations. Track rows capture title, artist fields, writers/composers/producers, cover proof, ISRC, audio URL, duration, and explicit flag.

Distribution workflow: Existing workflow is payment -> release stored as `submitted` -> queue/review -> admin manually changes statuses. No distributor API submission existed before this implementation.

Admin workflow: `AdminControlCenter` lists releases and lets admins set status manually. Approval now routes through the new server-side distribution service.

## 2. Gap Analysis

Missing before implementation:

- Distributor API authentication, payload generation, response handling, retry handling, and logs.
- Statuses for changes requested, queued for distribution, sent to distributor, processing, delivered, and failed.
- Distribution logs with request/response/warnings/errors.
- Release-specific audit trail.
- Persistent distributor release ID, timestamps, and track distributor status columns.
- Server-side validation for track count rules, public asset URLs, contributor first/last names, and distribution blocking.
- Frontend fields for full distributor requirements such as album version, content type documents, presave/exclusive dates, owner email, additional notes, Instagram/X/IPI/IPRS details, lyrics, preview start, and vocalist.
- Public URL conversion guarantee for local uploads in production.
- Official distributor endpoint/schema documentation in the repo.

## 3. Database Changes

Added `db/distribution-automation.sql` for the MySQL path. It expands release statuses, adds distributor metadata columns, adds extra release/track metadata columns requested by the distributor spec, and creates `distribution_logs` plus `release_audit_logs`.

Updated `prisma/schema.prisma` with expanded statuses, distributor fields, track distributor status/audio URL, and a `DistributionLog` model.

## 4. Frontend Changes

Updated admin release detail view to show a Distribution section with status, UPC, distributor ID, submission date, track ISRCs, log entries, audit trail, refresh, and retry. Artist release portal now groups the expanded statuses into Draft/Scheduled/Released/Needs Attention instead of mislabeling distributor states.

## 5. Backend Changes

Added `lib/distribution-service.ts` with:

- `validateRelease()`
- `buildDistributorPayload()`
- `submitRelease()`
- `retrySubmission()`
- `logDistributionEvent()`

Updated admin approval so clicking `approved` validates and submits to the distributor endpoint server-side.

Added `app/api/admin/releases/[id]/distribution/route.ts` for distribution details and manual retry.

## 6. API Integration

Server-side env vars:

- `DISTRIBUTOR_CLIENT_ID`
- `DISTRIBUTOR_API_PIN`
- `DISTRIBUTOR_RELEASE_ENDPOINT`
- `DISTRIBUTOR_STATUS_ENDPOINT`

The client ID and PIN are read only server-side. The endpoint variables are intentionally required because the distributor documentation was not present in the workspace; no undocumented endpoint was invented.

## 7. Validation Layer

Server validation blocks distribution when required release fields, track count rules, public artwork/audio URLs, writer/composer first and last names, or cover license requirements fail. Validation errors are logged and returned to admin UI.

## 8. Logging Layer

Distribution attempts write request payload, response payload, warnings, errors, success flag, and timestamp to `distribution_logs`. Runtime helpers create this table on demand for MySQL.

## 9. Audit Layer

Release-specific audit records are created for approval start, validation failure, successful submission, retryable distributor errors, hard failures, network errors, and retries.

## 10. Testing Coverage

No test framework is configured in `package.json`. Verification was done with TypeScript build. Recommended next tests: unit tests for validation and payload mapping, mocked API submission tests, admin approval route tests, retry behavior tests, and Playwright coverage for form/admin flows.

## 11. Deployment Notes

Set `PUBLIC_SITE_URL` to the production HTTPS domain so local upload paths can be converted into public URLs. Run the applicable database migration path before approval is used in production. Configure `DISTRIBUTOR_RELEASE_ENDPOINT` from the official distributor documentation. Use bucket/object storage for production uploads if the Next.js deployment cannot publicly serve `public/uploads`.

## 12. Production-Ready Implementation Status

Implemented: server-side credential loading, validation, payload generation, submit/retry service, status tracking, UPC/ISRC extraction, logging, audit trail, admin approval automation, retry UI/API, env documentation, and migration scripts.

Blocked by missing source-of-truth distributor documentation: exact endpoint URL, exact authentication header/body contract, exact payload field names, status sync endpoint semantics, and final response schema. The current service is designed to be adapted by changing the endpoint env vars and the mapper once that documentation is available.
