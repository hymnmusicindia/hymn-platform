# Release distribution pipeline audit

Audit date: 2026-09-23. Scope: the 67-section release-pipeline brief. “Verified” means repository behavior was exercised by an automated check; it does not mean a real DSP accepted a production release.

## Actual flow

Customer form → resumable private asset upload → atomic draft save → authoritative server validation → immutable review hash → order/entitlement verification → HYMN review queue → explicit DireNote ingestion attempt → provider acknowledgement → authenticated polling → per-store and aggregate status → customer/admin portals. Corrections create a new attempt while preserving UPC/ISRC identity; asset replacements and takedowns are tracked requests because DireNote v2.2 does not publish direct endpoints for them.

## Critical defects found and fixed

- Prisma’s default five-second interactive transaction expired while synchronizing contributors. Expensive identity preparation was moved outside the transaction and the bounded database transaction now has a 30-second timeout.
- HTTP 200 and internal status values could be treated as provider acceptance. DireNote success must now be explicit, uncertain deliveries enter reconciliation, and historic releases cannot manufacture a submitted attempt without evidence.
- Submission retries could create duplicate delivery or identifiers. Payload identities, durable locks, retry backoff, current-attempt lineage, and unresolved-delivery quarantine now protect retries.
- Draft writes could partially replace tracks and contributors. Draft persistence is atomic, serialized per release, preserves stable track identity, and invalidates stale review approval.
- Review approval trusted a client snapshot. The hash is now computed from authoritative persisted release, track, and contribution data and is checked again before payment.
- Duplicate or malformed UPC/ISRC values could pass into reconciliation. Check digits/formats, cross-release conflicts, recording checksum agreement, and immutable identifier history are enforced.
- Chunk resume trusted chunk index/size. Chunks now have content hashes, conflicting retries are rejected, final assembly is streamed and verified, and abandoned finalization is recoverable.
- Media validation trusted metadata too far. WAV/MP3 and JPEG bytes are parsed; corrupt, truncated, wrong-type, wrong-dimension, and incomplete files are rejected.
- Ownership checks were inconsistent on release routes. Customer release access is owner-scoped and admin actions use RBAC and audit records.
- Payment callbacks and free-release races could arrive concurrently. Event ordering, replay protection, fulfillment recovery, and atomic entitlement redemption are covered.
- Artist matching by display name could attach the wrong profile. Submission uses explicit artist-profile identities and validates supported store URLs/IDs.
- Public artwork delivery depended on cached homepage composition after request session access, producing HTTP 500 for live cards. The image route now performs a direct visibility check and streams the private asset only for eligible live releases.

## Requirement coverage

| Sections | Status | Evidence and limitations |
| --- | --- | --- |
| 1–3 architecture, truthful success, state machine | Verified | Flow traced; transition guards and provider response matrix tested; no status-only provider evidence fallback remains. |
| 4–13 release/track/identifier/media/metadata/date validation | Verified | Shared server rules, Unicode/control-character fuzz cases, date-only parsing, release-type/track ordering, ISRC/UPC, decoded audio/artwork checks. Store-specific constraints remain limited to fields exposed by DireNote. |
| 14–15 rights, Content ID and UGC | Verified | Persisted declarations and separate channel capabilities; Content ID ownership validation blocks duplicates/ineligible declarations. Legal truth still depends on customer evidence and HYMN review. |
| 16–17 payload and DDEX | Partial / N/A | Sanitized deterministic DireNote DTO and snapshots are tested. HYMN sends DireNote JSON and does not generate ERN XML, so schema validation is not applicable. Internal entities map to release/resource/contributor/deal concepts. |
| 18–21 upload, transactions, concurrency, idempotency | Verified | Resume/content identity, atomic save rollback, advisory locks, duplicate-click, lost-response quarantine, bounded exponential retry tests. |
| 22–26 payment, provider failures, retry, webhook, polling | Verified | Free-offer race, Razorpay replay/out-of-order events, 4xx/5xx/timeout mapping, durable cron lease and polling monotonicity. DireNote publishes no webhook contract; authenticated polling is used. |
| 27–30 partial DSP, corrections, replacements, takedowns | Verified / Partial | Per-store partial state, correction re-ingest identity, tracked asset-update and takedown lifecycles are tested. Provider replacement/takedown execution remains a manual tracked operation because no DireNote API is documented. |
| 31–36 authorization, security, files, secrets, errors | Verified | IDOR/RBAC checks, bounded schemas, private tokenized asset delivery, safe errors and committed-file secret scan. Fixture credentials remain intentionally non-production. |
| 37–41 form, mobile, browser, session and data loss | Verified / Partial | Draft recovery, inline server errors, accessible alert, Chromium browser flow and 320/360/375/390/430 overflow checks. Expired-session recovery is exercised. WebKit/Firefox and physical mobile-device upload behavior were not run. |
| 42–46 observability, audit, stuck states, reconciliation, duplicates | Verified | Correlation/audit history, admin operational-health diagnostics, read-only DB/storage reconciliation report, and UPC/ISRC/audio identity duplicate checks. Reconciliation never auto-deletes media. |
| 47–51 provider contract, capabilities, preflight, workflow, snapshots | Verified | DireNote v2.2 checked; centralized channel registry; all-errors preflight before payment; authoritative review hash and immutable attempt payload snapshots. |
| 52–55 tests, chaos/fuzz and recovery | Verified | Unit/source contracts, isolated PostgreSQL integration, browser E2E, write-conflict race, rollback, interrupted upload, uncertain provider response and admin recovery routes/tools. |
| 56–60 status UX, compatibility, migrations, performance, accessibility | Verified / Partial | Customer-facing status mapping, incremental changes, safe migration, ten-track album flow, streamed assembly, labels/live regions. Formal screen-reader and load-tool audits were not run. |
| 61–67 standards, priorities, implementation and final verification | Verified with external limits | Official DireNote, DDEX, Apple and YouTube guidance reviewed. Production DSP delivery needs real credentials and release approval and is intentionally excluded from automated tests. |

## Database migration

`20260923070000_upload_content_identity` adds upload/session content identity needed to detect resumed-chunk conflicts and verify complete files. It is additive and must be deployed before the new application version. Existing production rows are preserved.

## Scenario matrix

| Scenario | Result |
| --- | --- |
| A single WAV/JPEG; B ten-track album | Passed in isolated PostgreSQL/E2E fixtures. |
| C corrupt audio; D invalid artwork; E bad ISRC | Rejected by media/identifier tests before submission. |
| F duplicate click; G timeout; H 500; I 422 | One attempt, reconciliation on uncertainty, bounded retry where safe, actionable permanent failure. |
| J interrupted network/upload | Resumable chunks and stale-finalization recovery passed. |
| K paid but submission fails; L duplicate webhook; M out-of-order webhook | Payment remains attached and replay/order protections passed. |
| N another user’s release; O unsafe artist mapping | Access denied without disclosure; explicit profile identity required. |
| P partial DSP; Q correction; R takedown | Per-store partial state and tracked correction/takedown lifecycle passed. |
| S expired session; T simultaneous first-free requests | Draft recovered after reauthentication; only one entitlement redeemed. |

## Remaining operational risks

- DireNote has no documented ingestion idempotency key, webhook, correction, or takedown endpoint. A lost ingestion response is quarantined for reconciliation rather than blindly retried.
- Production storage/provider availability and genuine DSP delivery cannot be proven by fixtures. Admin diagnostics, submission history, and reconciliation tools provide the recovery path.
- `npm audit --omit=dev` retains the high-severity `deepmerge-ts` advisory through the Prisma CLI configuration dependency. npm’s proposed fix is a breaking Prisma downgrade; the affected CLI is not exposed to requests. Runtime critical Next.js and Sharp advisories were patched.
- The Hostinger deployment must run the database migration and restart from the pushed commit. Public artwork should be checked for an HTTP 200 image response after deployment.

## Commands used for final verification

- `npx tsc --noEmit`: passed.
- `npm test`: passed.
- `npm run lint`: passed with 0 errors and 84 existing warnings.
- `npm run test:direnote-virtual`: passed.
- `npm run test:direnote-e2e`: passed, including the Next.js 16.3.6 production build and Chromium browser run.
- `npm audit --omit=dev --json`: 0 critical, 3 high entries representing one Prisma CLI `deepmerge-ts` advisory; documented above.
- Production artwork probe after the earlier push: still HTTP 500, showing Hostinger has not yet activated the pushed route fix or restarted the application.
