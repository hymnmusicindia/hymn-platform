# Release QC reports

HYMN captures verified DireNote QC evidence before opening provider corrections. Customers and administrators can open `/dashboard/releases/{id}/qc-report`; the correction workspace, administrator rights review and correction emails link there. JSON download is available at `/api/releases/{id}/qc-report?download=1`. Both routes require the release owner or `releases.read` permission and return no shared cached customer data. Login returns to the requested report using a narrowly validated internal path.

The report shows local track identity, provider-source identity, fingerprint candidates, affected and reference timestamps, raw match scores, labels, reported rights owners, distributors, claim policies and permitted Spotify/YouTube links. Unscanned and scanned-without-analysis states are distinct. Matches are evidence for review, not automatic findings of infringement or percentage probabilities.

## Fetch, persistence and correction email

The existing status worker calls `/check_qc_report` when provider remarks/status indicate issues. The provider request body contains only `upc`, server-side `client_id` and `pin`. It uses the shared provider budget and an hour cache scoped to release, submission attempt, review fingerprint and QC-source UPC. Provider 429 responses preserve the existing cooldown. API failures do not discard the original correction request.

The response must confirm its UPC and map every row to exactly one local recording. Conflicting, incomplete or duplicate identities cannot become a customer report. QC sources linked from the provider's fixed dashboard report URL can be used, but their tracks must still verify. Browser input never chooses an upstream URL or credentials.

Normalized, bounded customer-safe snapshots are stored in the existing `DireNoteLog` ledger as `release_qc_details`. Sensitive provider payloads are not exposed by the customer API. Reports are scoped to the current attempt/UPC, and superseded-attempt reports do not appear on a new submission. A later response omitting ACR data does not erase the latest saved match evidence, even after many empty polls. Every displayed snapshot identifies when it was captured and whether it came from the API or a partner-supplied report.

Match evidence enriches track correction fields only when the provider has already reported an issue. Stable evidence fingerprints drive the existing transactional correction/outbox flow. Repeated unchanged syncs produce no duplicate correction email; changed evidence can generate a new correction event. Emails include a first-party report URL and selected recording/timestamp details. Full details stay behind account access checks.

No database migration is required. Publish the frontend and backend together. Queued mail must only be delivered after the report route is deployed.

## Different submission and QC-source UPCs

A QC-source UPC is not automatically the current distribution UPC. DireNote can have a historical QC record whose top-level ISRCs differ while its lookup results point to the current recording identifiers. Preserve the current provider-verified submission UPC/ISRCs; bind the QC source separately for that attempt. A title-only match is insufficient.

The scoped reconciliation tool verifies the current provider submission and all QC-source track links, audits the binding and optionally imports the full report supplied by DireNote. Its dry run makes no catalogue changes. Apply rechecks the active attempt and recording identities under the existing reconciliation lock. It does not submit releases, change delivery identifiers, import royalties or send email.

```sh
node --conditions=react-server --import tsx scripts/reconcile-release-qc-source.ts --env=.env.hostinger --release=<id> --qc-upc=<source-upc> --support-file=<report.json>
# After reviewing the verified mapping, run the same command with --apply.
```

## Verification

```sh
node --import tsx scripts/verify-direnote-virtual.ts --qc-report-only
node scripts/verify-release-qc-browser.cjs
node --conditions=react-server --import tsx scripts/verify-track-qc-corrections.ts
```

The isolated PostgreSQL integration test exercises actual provider synchronization, report storage, track corrections, email outbox deduplication, mismatched identities, source aliases, archived evidence retention, private API access/download, safe login return paths and template escaping. Browser tests check responsive report rendering, timestamps, provenance, unavailable states and safe links.
