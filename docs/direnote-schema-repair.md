# DireNote Submission Schema Repair

## Cause

On September 8, 2026, the configured production database was missing all nine
DireNote attempt-history columns. Neither the history migration nor the new
snapshot migration was recorded. Prisma selects mapped scalar fields by default,
so even a submission-attempt lookup failed before ingestion.

## Repair

`scripts/repair-direnote-snapshot-schema.ts <environment-file>` reads only database
identity, schema columns and the two relevant migration records. `--apply` first
enforces the pinned production database identity, then applies only the additive
history and snapshot SQL inside one transaction with a five-second lock timeout.
It verifies column readiness and the previously failing Prisma lookup. It does
not submit releases, change payment records, or fabricate submission history.

This targeted repair deliberately does not mark migrations as applied. The SQL
is idempotent; the normal reviewed `npm run deploy:release` procedure can apply
and record them later. Do not use `db push`, reset, or a fresh baseline against
production to address missing columns.

The separate `20260908000000_direnote_payload_snapshots` migration also covers
databases where the earlier history migration was already recorded before its
snapshot fields were added.

## Prevention

Vercel explicitly uses `npm run vercel-build`. Production builds perform a
read-only submission-schema check before compiling the application. Traditional
production startup and the migration deployment script also check readiness.
Apply migrations before deploying code that requires new columns; a failed check
must be resolved through the migration procedure, not disabled.

The isolated PostgreSQL suite reproduces missing snapshot columns, verifies the
readiness failure, applies the forward migration twice, exercises the Prisma
lookup and runs the complete submission/correction lifecycle.
