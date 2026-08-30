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

## Production identity and privilege boundary

HYMN now refuses production startup and migration deployment unless the canonical `public` schema and core tables are present. Set `EXPECTED_DATABASE_HOST`, `EXPECTED_DATABASE_NAME`, and `EXPECTED_NEON_BRANCH_ID` in Hostinger so a copied URL for the wrong Neon project or branch fails closed. Obtain the branch identifier with `SELECT current_setting('neon.branch_id', true);`.

Use separate Neon credentials:

- `DATABASE_URL`: a restricted runtime role with `CONNECT`, schema `USAGE`, table `SELECT/INSERT/UPDATE/DELETE`, and sequence `USAGE/SELECT`; it must not own the database/schema and must not have `CREATE` or DDL privileges.
- `MIGRATION_DATABASE_URL`: the Neon owner credential, available only to the explicit migration command and never to the running web process when the hosting platform supports build-only variables.

Revoke schema creation from the runtime role and `PUBLIC`. Configure owner default privileges so new migration-created tables and sequences remain usable by the runtime role. Rotate both credentials after any accidental exposure. The guarded `npm start` and `npm run db:migrate:deploy` commands validate database identity without printing credentials.

After the restricted runtime credential is installed, set `REQUIRE_RESTRICTED_DATABASE_ROLE=true`. Startup will then refuse an owner or schema-creating credential, preventing the web process from executing `DROP TABLE`/`DROP SCHEMA` even if a future application defect attempted it.

## Brand-new empty database

The historical incremental chain predates the migration ledger and assumes core tables already exist. For a brand-new database only, set `DATABASE_URL` to the empty target, set `CONFIRM_EMPTY_DATABASE_BASELINE=yes`, and run `npm run db:migrate:fresh`. The installer queries PostgreSQL first and refuses any target containing a public table. It applies the reviewed `prisma/fresh-baseline.sql`, records the historical migration directories as applied, and finally runs `prisma migrate deploy` for forward compatibility. Never use this command for an existing environment.

## Rollback

Prisma production migrations are forward-only. If application behavior fails without data corruption, roll back the application artifact while leaving compatible additive schema changes in place. If a migration corrupts or destructively transforms data, stop writers, preserve the failed database for investigation, restore the verified pre-deployment backup to a new database, repoint the application through secret configuration, and smoke-test before reopening traffic. Do not improvise a destructive down migration on the live database.

Record the migration name, operator, start/end times, backup identifier, verification result, and any recovery action in the deployment log.
