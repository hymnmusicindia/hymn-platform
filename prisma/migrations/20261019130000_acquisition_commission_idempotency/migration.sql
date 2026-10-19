ALTER TABLE "acquisition_commissions"
  DROP CONSTRAINT "acquisition_commissions_source_employee_role_unique";

CREATE UNIQUE INDEX "acquisition_commissions_earned_source_role_unique"
  ON "acquisition_commissions"("source_type", "source_id", "employee_id", "attribution_role")
  WHERE "entry_type" = 'EARNED';

CREATE UNIQUE INDEX "acquisition_commissions_adjustment_reference_unique"
  ON "acquisition_commissions"("source_type", "source_id", "employee_id", "attribution_role", "adjustment_reference")
  WHERE "entry_type" = 'ADJUSTMENT' AND "adjustment_reference" IS NOT NULL;
