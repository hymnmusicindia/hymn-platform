# Database deployment and rollback

Prisma migrations are the only supported production schema deployment path. Application builds generate the client and compile Next.js; they do not mutate the database.

## Deployment

1. Put the application into an appropriate maintenance/deploy state and stop background jobs that write affected tables.
2. Create and verify a restorable PostgreSQL backup using the hosting provider's existing backup facility or `pg_dump`.
3. Confirm `DATABASE_URL` targets the intended database without printing credentials. Run `npm run db:generate` and `npx prisma validate`.
4. Rehearse `npm run db:migrate:deploy` against a restored copy. Review migration output and application smoke tests.
5. Run `npm run db:migrate:deploy` once against production before starting the new application version.
6. Deploy the application, then check the admin system-readiness endpoint and core authenticated flows.

Never run `prisma db push`, `--accept-data-loss`, or an unreviewed migration against production.

## Brand-new empty database

The historical incremental chain predates the migration ledger and assumes core tables already exist. For a brand-new database only, set `DATABASE_URL` to the empty target, set `CONFIRM_EMPTY_DATABASE_BASELINE=yes`, and run `npm run db:migrate:fresh`. The installer queries PostgreSQL first and refuses any target containing a public table. It applies the reviewed `prisma/fresh-baseline.sql`, records the historical migration directories as applied, and finally runs `prisma migrate deploy` for forward compatibility. Never use this command for an existing environment.

## Rollback

Prisma production migrations are forward-only. If application behavior fails without data corruption, roll back the application artifact while leaving compatible additive schema changes in place. If a migration corrupts or destructively transforms data, stop writers, preserve the failed database for investigation, restore the verified pre-deployment backup to a new database, repoint the application through secret configuration, and smoke-test before reopening traffic. Do not improvise a destructive down migration on the live database.

Record the migration name, operator, start/end times, backup identifier, verification result, and any recovery action in the deployment log.
