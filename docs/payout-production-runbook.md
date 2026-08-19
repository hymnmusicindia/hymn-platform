# HYMN payout production runbook

## Required production configuration

- `DATABASE_URL`: production PostgreSQL connection.
- `PAYOUT_ENCRYPTION_KEY`: stable high-entropy secret used for AES-256-GCM payout credential encryption. Back it up securely; rotating it requires a controlled re-encryption job.
- `CRON_SECRET`: protects automatic quarterly closing.
- `BLOB_READ_WRITE_TOKEN`: private immutable Excel report storage.
- `PAYOUT_CYCLE=quarterly`.
- `ALLOW_PAYOUT_REQUESTS_DURING_OPEN_QUARTER=false` unless finance explicitly approves rolling withdrawals.
- Optional Google Sheets mirror variables from `.env.example`. Sheets are never authoritative.

## Deployment order

1. Back up the production database.
2. Configure the required secrets in the deployment platform.
3. Run `npm run db:migrate:deploy` once against production.
4. Run `npm run test:payout` and `npm run build` in CI.
5. Deploy the application.
6. Confirm `/api/admin/payout-reports` is accessible only to admins.
7. Generate a staging monthly report and verify private download authorization.
8. Import a small statement in preview mode, verify ISRC/UPC matching, then confirm it.
9. Test quarter closing on a staging quarter. Verify the old period is locked, carry-forward rows are unique, balances are unchanged, and the next quarter is open.

## Excel report location

Generated files are stored privately in Vercel Blob under `payout-reports/`. The `payout_reports.storage_path` column records the private object URL. Users and admins download through `/api/payout/reports/{reportId}/download`; the application checks authorization before proxying the private object. Files are not committed to the repository or exposed through a public Blob URL.

## Quarter-close recovery

- A period moves from `open` to `closing` using a compare-and-set update, preventing concurrent closing jobs.
- Report failure returns the period to `open`, records a failed report and audit event, and does not alter wallet or royalty history.
- Carry-forward rows use a unique user/from/to-quarter key, so retries cannot duplicate carry-forward entries.
- Never delete royalty, split earning, wallet, payout, carry-forward, period, report, or audit rows. Corrections use reversals or new adjustments.

## Monitoring alerts

Alert finance/engineering when:

- a payout period remains `closing` for more than 30 minutes;
- a `payout_reports` row has `status=failed`;
- unmatched royalty rows remain before quarter end;
- the quarterly cron returns a non-2xx response;
- available or pending balances become negative;
- private Blob storage or Google Sheets mirroring fails.

## Dependency audit exception

The application is pinned to the current stable Next.js release. As of this implementation, `npm audit` still attributes a high-severity PostCSS advisory to the PostCSS copy bundled inside Next.js and recommends an invalid downgrade to Next 9.3.3. HYMN overrides direct PostCSS and image-processing dependencies to patched releases, but npm continues to report the bundled Next.js path. Do not apply `npm audit fix --force`; review this exception whenever Next.js publishes a release that updates its bundled PostCSS dependency. No user-controlled CSS or source-map input is accepted by the payout/reporting module.
