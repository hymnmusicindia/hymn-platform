CREATE TABLE "acquisition_payout_cancellations" (
  "payout_id" TEXT PRIMARY KEY REFERENCES "acquisition_payouts"("id") ON DELETE RESTRICT,
  "reason" TEXT NOT NULL CHECK (length("reason") >= 8),
  "recorded_by_employee_id" TEXT NOT NULL REFERENCES "team_memberships"("id") ON DELETE RESTRICT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER acquisition_payout_cancellations_immutable BEFORE UPDATE OR DELETE
  ON "acquisition_payout_cancellations" FOR EACH ROW EXECUTE FUNCTION acquisition_payout_immutable();

ALTER TABLE "acquisition_payout_items" DROP CONSTRAINT "acquisition_payout_items_commission_unique";
CREATE INDEX "acquisition_payout_items_commission_id_idx" ON "acquisition_payout_items"("commission_id");

CREATE FUNCTION acquisition_active_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM acquisition_commissions WHERE id = NEW.commission_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM acquisition_payout_cancellations WHERE payout_id = NEW.payout_id)
    OR EXISTS (SELECT 1 FROM acquisition_payout_items i
      LEFT JOIN acquisition_payout_cancellations c ON c.payout_id = i.payout_id
      WHERE i.commission_id = NEW.commission_id AND c.payout_id IS NULL) THEN
    RAISE EXCEPTION 'Commission already reserved by an active payout or target batch cancelled';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER acquisition_active_reservation_guard BEFORE INSERT ON "acquisition_payout_items"
  FOR EACH ROW EXECUTE FUNCTION acquisition_active_reservation_guard();

CREATE FUNCTION acquisition_payout_terminal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM acquisition_payouts WHERE id = NEW.payout_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM acquisition_payout_payments WHERE payout_id = NEW.payout_id)
    OR EXISTS (SELECT 1 FROM acquisition_payout_cancellations WHERE payout_id = NEW.payout_id) THEN
    RAISE EXCEPTION 'Payout already paid or cancelled';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER acquisition_payout_cancel_guard BEFORE INSERT ON "acquisition_payout_cancellations"
  FOR EACH ROW EXECUTE FUNCTION acquisition_payout_terminal_guard();
CREATE TRIGGER acquisition_payout_payment_guard BEFORE INSERT ON "acquisition_payout_payments"
  FOR EACH ROW EXECUTE FUNCTION acquisition_payout_terminal_guard();

ALTER TABLE "acquisition_revenue_evidence" DROP CONSTRAINT "acquisition_revenue_evidence_status_check";
ALTER TABLE "acquisition_revenue_evidence" ADD CONSTRAINT "acquisition_revenue_evidence_status_check"
  CHECK ("status" IN ('RECONCILIATION_REQUIRED','RECONCILED','ADJUSTMENT_REQUIRED','DISPUTED'));
