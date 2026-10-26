# Distribution reporting audit — 26 October 2026

## Verdict

**Connected, but production is degraded; end-to-end financial reporting is not yet proven with real earnings.** Fixes in this audit are local workspace changes, not a production deployment.

The read-only production audit ran at approximately 08:56 IST on 26 October. Evidence is in `artifacts/audits/distribution-reports-live.json`. Credentials, customer identifiers and report financial details are omitted. The audit reserves provider request capacity through HYMN's shared budget; it never submits releases or imports production royalties.

## Live evidence

| Check | Result |
| --- | --- |
| `check_revenue_report` | HTTP 200, explicit provider success, requested recording matched; zero financial rows |
| `check_release_status` | HTTP 200, explicit provider success, four tracks returned |
| `check_qc_report` | HTTP 200, explicit provider success, four tracks returned |
| `list_payouts` | HTTP 200, explicit provider success |
| Last seven days | 420 successful revenue lookup logs; 955 stored QC detail logs |
| Latest 20 stored revenue reports | All normalize successfully; all have zero rows |
| Royalty statements | Zero records in the configured production database |
| Scheduler | Recent revenue and ingest jobs completed; repeated release-sync jobs failed |
| Recent release-sync errors | Shared hourly request capacity exhausted |

Zero earnings are not proof of a broken endpoint. They also cannot prove matching, financial allocations or payout balances work with actual statements. No real production financial data was fabricated to fill this gap.

## Repairs

- Release, revenue and async-ingest jobs now stop dispatching work when local capacity or provider Retry-After is reached. They report `rateLimited`, retry delay and deferred counts, preserve pending attempts, and do not mislabel unattempted work as release failures. Release and identity workers share the stop signal. Real provider and data failures still fail the job.
- Shared provider-429 handling now covers release, artist, songwriter, revenue and ingest-status reads. Diagnostics keep capacity deferral visible as degraded health rather than claiming the entire catalogue was synchronized.
- Fixed the diagnostics panel to read `startedAt` and `summary` from the actual sync-run response, with safe handling for absent summaries and visible deferred-work counts.
- Removed release-status and missing-UPC conditions that bypassed the 15-minute polling interval. The legacy-lineage recovery path now observes that interval too. This reduces redundant calls; a larger catalogue can still exceed the shared budget and needs capacity-aware scheduling.
- Connected the admin royalty screen to revenue preview and explicit ledger import. The existing scheduled import remains connected to the same service.
- Separated preview logs from import logs so previews cannot suppress scheduled ingestion. Import success is recorded only after validation and ledger processing complete. Failed imports remain eligible after the existing 30-minute backoff.
- Validate returned ISRC against the requested recording. Invalid months, missing breakdowns, null/blank/non-numeric amounts, fractional quantities and malformed currencies fail explicitly instead of silently dropping rows or manufacturing zero values.
- Match ledger ownership using ISRC and, when supplied, UPC. Ambiguous or conflicting matches go to unmatched reconciliation. Unmatched rows now retain financial fields expected by the reconciliation tool.
- Narrowed duplicate handling to actual statement-checksum conflicts and report duplicate row counts accurately.
- Revenue HTTP 429 responses establish shared Retry-After cooldown. The admin endpoint validates origin, input and actor attribution, returns private/no-store responses and propagates local rate-limit errors as 429.
- Royalty allocation rejects a currency that conflicts with an existing recipient balance, rolling back the statement. No exchange rate or conversion is invented. Currency reconciliation remains an operational requirement.

HYMN applies zero additional royalty commission in this importer; provider revenue is not described as a HYMN commission. Partner settlements remain separate from artist withdrawals.

## Endpoint coverage and contract limits

The [current official API reference](https://distribution.direnotemedia.com/dnm_api) identifies itself as v2.6 and includes a v2.7 changelog entry dated 22 October. The revenue response remains compatible with HYMN's monthly-breakdown parser. The v2.7 QC change concerns provider-side selection of stored checks by UPC and track name; HYMN continues verifying returned identities before exposing reports.

The five original endpoints and nineteen v2.4 operations have passing local transport/contract tests. Asynchronous ingestion also has an existing `ingest_status` integration. Existing correction workflows implement eight support mutations and `list_support_requests`.

Static inspection did **not** find integrations for `request_takedown`, the four platform claim-release operations, `request_instagram_linking`, or `request_yt_oac`. These are separate mutation workflows, not required to retrieve QC or revenue reports. This audit does not claim all 41 currently documented endpoints are connected. Live checks covered the four reporting/status endpoints listed above; provider writes were not exercised.

## Verification

- `npm run test:direnote-contract`: original endpoint payload contracts and provider HTTP/network/timeout/rate-limit failure matrix passed.
- `node --import tsx scripts/verify-direnote-v24.ts`: all nineteen allowlisted operations passed with simulated transport.
- `node --import tsx scripts/verify-direnote-virtual.ts --qc-report-only`: isolated PostgreSQL QC persistence, corrections, email deduplication, private downloads and identity rejection passed.
- `node --import tsx scripts/verify-direnote-virtual.ts --reconciliation-cron-only`: isolated status reconciliation, immediate repeat suppression, later retries, notification deduplication and no duplicate ingest passed.
- The reconciliation suite additionally verifies exhausted-capacity behavior for release, revenue and ingest polling: no new provider calls, no false release-failure records, accurate deferred counts and unchanged attempt eligibility.
- `node --import tsx scripts/verify-direnote-virtual.ts --reports-only`: isolated normalization, preview/import separation, recording binding, failed-import evidence, real ledger/balance allocation, replay protection, mixed-currency rollback and shared cooldown checks passed. The existing royalty import, adjustment, manual matching, split allocation and reconciliation suite also passed in the same isolated database.
- The full production build passed against isolated PostgreSQL using `--reports-only --build`, followed by the reporting and existing royalty-ledger suites. TypeScript, targeted ESLint and `git diff --check` passed. Browser verification of the new admin preview panel was not performed.

Production acceptance still requires deploying these changes, observing subsequent scheduler runs under the real account allowance, and reconciling the first non-empty statement through customer balances. There is no basis to promise failure-free operation from endpoint connectivity alone.
