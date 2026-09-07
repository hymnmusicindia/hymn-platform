# DireNote redressal deployment

## Verification

Run `npm test`, `npm run lint`, `npx tsc --noEmit`,
`npm run test:direnote-corrections`, and `npm run test:direnote-e2e`.
The last command starts an isolated PostgreSQL instance on loopback port 55439,
a fake DireNote provider on 55440, builds Next.js, and runs Chromium against
the production server on 55441. It uses fake credentials and disables email
delivery. Email-log deduplication is verified without sending mail.

Install the browser with `npx playwright install chromium` before the first run.
Test database files and screenshots remain under ignored `.cache/` paths.
The runner never loads the production database into its fixture.

## Migration and polling

Use the existing production migration deployment process, including its backup
and database-target checks. Apply `20260906000000_direnote_attempt_history`
before deploying application code that reads the new attempt columns. This is
an additive migration; it preserves the release, track, notification and attempt
tables. A partial unique index enforces one current attempt per release/provider.

Existing submitted releases are adopted idempotently when first synchronized.
This reuses their existing successful attempt where available. An explicit null
UPC on the latest successful response is not replaced with an older release UPC.
Identifier discovery remains in the existing service; unavailable identifiers
produce a diagnostic, not another ingest.

`vercel.json` now uses `0 * * * *`. That file does not install a Hostinger cron.
In Hostinger, configure an hourly job (minute 0, every hour/day/month/week) that
executes a server-owned command equivalent to:

```sh
curl --fail --silent --show-error --max-time 300 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  https://hymnmusic.fun/api/cron/direnote-release-sync
```

Supply `CRON_SECRET` through the host's protected environment or a private
configuration file readable only by the application account. Do not put the
secret in a URL, repository, or public script. Hourly scheduling is independent
of the server's timezone; stored timestamps use UTC. Keep
`DIRENOTE_RELEASE_SYNC_ENABLED=true`, and retain the existing server-only
DireNote credential and endpoint configuration.

The worker handles at most 50 releases per invocation, oldest checked first,
with a bounded runtime and provider-wide request reservations. At higher volume,
review the hourly capacity against the existing provider limit before expanding
the batch. Live releases are excluded. PostgreSQL locks serialize overlapping
cron invocations and per-release sync/ingest/edit operations.

## Controlled production recovery

Use `node --import tsx scripts/inspect-direnote-recovery.ts ENV_FILE` for a
read-only Magenta inspection. Before enabling broad polling, use the existing
admin **Sync with DireNote** action for the intended release and inspect
`DireNoteLog`, current attempt identifiers, corrections and notifications.

The production inspection on 2026-09-06 found Magenta release 19 with two
successful attempts and release 17 with a retryable attempt. Release 19's UPC
was 3473620313503 while its current track ISRCs ended 02450 and 02451. These
records require controlled reconciliation; do not merge or delete the separate
release records based on their shared title alone. No production mutation was
performed by the inspection tool.

Unmapped provider remarks remain visible in review issues and the existing
admin correction task. Operators can use the existing release review workflow
to select a known track/field. No instrumental metadata field is fabricated.
Keep monitoring after correction resubmission; provider acceptance closes
the current review while historical submissions remain available.
