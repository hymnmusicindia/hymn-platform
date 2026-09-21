-- Quarterly periods left "month" null and monthly periods left "quarter" null.
-- Every lookup against the (type, month, quarter, year) key therefore failed,
-- and PostgreSQL treats null rows as distinct, so the unique constraint never
-- enforced one period per type/year. Store 0 for the field a period type does
-- not use, which makes both the lookup and the constraint work.
--
-- Additive and reversible: no column, index or row is dropped. Each statement
-- is a no-op when the migration has already been applied.

UPDATE "payout_periods" SET "month" = 0 WHERE "month" IS NULL;
UPDATE "payout_periods" SET "quarter" = 0 WHERE "quarter" IS NULL;

ALTER TABLE "payout_periods" ALTER COLUMN "month" SET DEFAULT 0;
ALTER TABLE "payout_periods" ALTER COLUMN "quarter" SET DEFAULT 0;

ALTER TABLE "payout_periods" ALTER COLUMN "month" SET NOT NULL;
ALTER TABLE "payout_periods" ALTER COLUMN "quarter" SET NOT NULL;
