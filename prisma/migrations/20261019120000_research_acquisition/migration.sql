CREATE TABLE "acquisition_leads" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "prospect_id" TEXT NOT NULL,
    "researcher_employee_id" TEXT NOT NULL,
    "acquisition_employee_id" TEXT,
    "customer_id" INTEGER,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "converted_at" TIMESTAMP(3),
    "attribution_locked_at" TIMESTAMP(3),
    CONSTRAINT "acquisition_leads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "acquisition_leads_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_leads_prospect_fkey" FOREIGN KEY ("prospect_id") REFERENCES "team_prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_leads_researcher_fkey" FOREIGN KEY ("researcher_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_leads_acquisition_employee_fkey" FOREIGN KEY ("acquisition_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_leads_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_leads_prospect_unique" UNIQUE ("prospect_id")
);
CREATE INDEX "acquisition_leads_workspace_registered_idx" ON "acquisition_leads"("workspace_id", "registered_at");
CREATE INDEX "acquisition_leads_customer_idx" ON "acquisition_leads"("customer_id");
CREATE UNIQUE INDEX "acquisition_leads_customer_unique" ON "acquisition_leads"("customer_id") WHERE "customer_id" IS NOT NULL;
CREATE INDEX "acquisition_leads_researcher_registered_idx" ON "acquisition_leads"("researcher_employee_id", "registered_at");
CREATE INDEX "acquisition_leads_acquisition_registered_idx" ON "acquisition_leads"("acquisition_employee_id", "registered_at");

CREATE TABLE "lead_ownership_events" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "actor_employee_id" TEXT NOT NULL,
    "previous_employee_id" TEXT,
    "new_employee_id" TEXT NOT NULL,
    "attribution_role" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_ownership_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "lead_ownership_events_lead_fkey" FOREIGN KEY ("lead_id") REFERENCES "acquisition_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "lead_ownership_events_actor_fkey" FOREIGN KEY ("actor_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "lead_ownership_events_lead_created_idx" ON "lead_ownership_events"("lead_id", "created_at");

CREATE TABLE "acquisition_clicks" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "campaign" TEXT NOT NULL DEFAULT 'employee_lead_link',
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acquisition_clicks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "acquisition_clicks_lead_fkey" FOREIGN KEY ("lead_id") REFERENCES "acquisition_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_clicks_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "acquisition_clicks_lead_clicked_idx" ON "acquisition_clicks"("lead_id", "clicked_at");

CREATE TABLE "acquisition_commissions" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "entry_type" TEXT NOT NULL DEFAULT 'EARNED',
    "adjustment_reference" TEXT,
    "employee_id" TEXT NOT NULL,
    "attribution_role" TEXT NOT NULL,
    "eligible_net_revenue_minor" INTEGER NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "calculation_basis" TEXT NOT NULL,
    "policy_version" INTEGER NOT NULL DEFAULT 1,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eligible_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payment_verification_reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acquisition_commissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "acquisition_commissions_lead_fkey" FOREIGN KEY ("lead_id") REFERENCES "acquisition_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_commissions_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_commissions_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_commissions_source_employee_role_unique" UNIQUE ("source_type", "source_id", "employee_id", "attribution_role", "entry_type", "adjustment_reference"),
    CONSTRAINT "acquisition_commissions_amount_check" CHECK ("eligible_net_revenue_minor" >= 0 AND "rate_bps" BETWEEN 0 AND 10000 AND ("entry_type" = 'EARNED' AND "amount_minor" >= 0 OR "entry_type" = 'ADJUSTMENT' AND "amount_minor" <> 0))
);
CREATE INDEX "acquisition_commissions_employee_status_created_idx" ON "acquisition_commissions"("employee_id", "status", "created_at");
CREATE INDEX "acquisition_commissions_lead_created_idx" ON "acquisition_commissions"("lead_id", "created_at");
CREATE INDEX "acquisition_commissions_payment_idx" ON "acquisition_commissions"("payment_id");

CREATE TABLE "acquisition_revenue_evidence" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "payment_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "recognised_revenue_minor" INTEGER NOT NULL,
    "applicable_taxes_minor" INTEGER,
    "refunds_chargebacks_minor" INTEGER,
    "direct_pass_through_costs_minor" INTEGER,
    "provider_fee_minor" INTEGER,
    "eligible_net_revenue_minor" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'RECONCILIATION_REQUIRED',
    "payment_verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cost_evidence" JSONB NOT NULL DEFAULT '[]',
    "tax_evidence" JSONB NOT NULL DEFAULT '[]',
    "policy_version" INTEGER NOT NULL DEFAULT 1,
    "reviewed_by_employee_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "acquisition_revenue_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "acquisition_revenue_evidence_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_revenue_evidence_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_revenue_evidence_reviewer_fkey" FOREIGN KEY ("reviewed_by_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_revenue_evidence_source_unique" UNIQUE ("source_type", "source_id"),
    CONSTRAINT "acquisition_revenue_evidence_payment_unique" UNIQUE ("payment_id")
);
CREATE INDEX "acquisition_revenue_evidence_workspace_status_created_idx" ON "acquisition_revenue_evidence"("workspace_id", "status", "created_at");
CREATE INDEX "acquisition_revenue_evidence_customer_created_idx" ON "acquisition_revenue_evidence"("customer_id", "created_at");

CREATE TABLE "acquisition_program_settings" (
    "workspace_id" TEXT NOT NULL,
    "researcher_rate_bps" INTEGER NOT NULL DEFAULT 200,
    "acquisition_rate_bps" INTEGER NOT NULL DEFAULT 300,
    "customer_referral_rate_bps" INTEGER NOT NULL DEFAULT 200,
    "maximum_reward_rate_bps" INTEGER NOT NULL DEFAULT 700,
    "hold_period_days" INTEGER NOT NULL DEFAULT 14,
    "payout_minimum_minor" INTEGER NOT NULL DEFAULT 50000,
    "payout_schedule" TEXT NOT NULL DEFAULT 'MONTHLY',
    "attribution_policy" TEXT NOT NULL DEFAULT 'Original researcher attribution is locked at registration. Acquisition attribution is assigned and audited. Earned ledger entries are preserved after employee departure, customer closure, or programme termination; fraud and disputed ownership require an audited admin hold or correction.',
    "revenue_policy" TEXT NOT NULL DEFAULT 'Paid amount less recorded refunds, taxes and third-party service costs; update cost inputs before this programme is active.',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_employee_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acquisition_program_settings_pkey" PRIMARY KEY ("workspace_id"),
    CONSTRAINT "acquisition_program_settings_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_program_settings_updater_fkey" FOREIGN KEY ("updated_by_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "acquisition_program_audit" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "actor_employee_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acquisition_program_audit_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "acquisition_program_audit_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "acquisition_program_audit_actor_fkey" FOREIGN KEY ("actor_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "acquisition_program_audit_workspace_created_idx" ON "acquisition_program_audit"("workspace_id", "created_at");

ALTER TABLE "team_prospects" ADD COLUMN "instagram_url" TEXT, ADD COLUMN "youtube_url" TEXT, ADD COLUMN "website_url" TEXT, ADD COLUMN "phone" TEXT, ADD COLUMN "country" TEXT, ADD COLUMN "city" TEXT, ADD COLUMN "contact_name" TEXT, ADD COLUMN "lead_category" TEXT NOT NULL DEFAULT 'Artist', ADD COLUMN "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "contact_eligibility" TEXT NOT NULL DEFAULT 'UNVERIFIED';

-- The legacy customer referral programme remains its own ledger and policy.
-- Customer referral rate is displayed for programme planning but is not stacked
-- by the employee acquisition service.
CREATE OR REPLACE FUNCTION acquisition_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Acquisition audit records are append-only';
END;
$$;
CREATE TRIGGER acquisition_program_audit_immutable BEFORE UPDATE OR DELETE ON "acquisition_program_audit" FOR EACH ROW EXECUTE FUNCTION acquisition_audit_immutable();
CREATE TRIGGER lead_ownership_events_immutable BEFORE UPDATE OR DELETE ON "lead_ownership_events" FOR EACH ROW EXECUTE FUNCTION acquisition_audit_immutable();
CREATE TRIGGER acquisition_commissions_immutable BEFORE UPDATE OR DELETE ON "acquisition_commissions" FOR EACH ROW EXECUTE FUNCTION acquisition_audit_immutable();

-- Team OS has a durable internal membership and permission graph. These tables
-- are server-written through that graph; no anonymous/client database role is
-- granted access to attribution or commission records.
ALTER TABLE "acquisition_commissions" ADD CONSTRAINT "acquisition_commissions_status_check" CHECK ("status" IN ('PENDING','APPROVED','PAID','REVERSED','ADJUSTED','DISPUTED'));
ALTER TABLE "lead_ownership_events" ADD CONSTRAINT "lead_ownership_events_role_check" CHECK ("attribution_role" IN ('RESEARCHER','ACQUISITION','LEAD_OWNER'));
ALTER TABLE "acquisition_commissions" ADD CONSTRAINT "acquisition_commissions_role_check" CHECK ("attribution_role" IN ('RESEARCHER','ACQUISITION'));
ALTER TABLE "acquisition_commissions" ADD CONSTRAINT "acquisition_commissions_entry_type_check" CHECK ("entry_type" IN ('EARNED','ADJUSTMENT'));
ALTER TABLE "acquisition_commissions" ADD CONSTRAINT "acquisition_commissions_adjustment_reference_check" CHECK (("entry_type" = 'EARNED' AND "adjustment_reference" IS NULL) OR ("entry_type" = 'ADJUSTMENT' AND "adjustment_reference" IS NOT NULL));
ALTER TABLE "acquisition_revenue_evidence" ADD CONSTRAINT "acquisition_revenue_evidence_status_check" CHECK ("status" IN ('RECONCILIATION_REQUIRED','RECONCILED','ADJUSTMENT_REQUIRED'));
ALTER TABLE "acquisition_program_settings" ADD CONSTRAINT "acquisition_program_settings_payout_schedule_check" CHECK ("payout_schedule" IN ('WEEKLY','BIWEEKLY','MONTHLY'));
ALTER TABLE "acquisition_program_settings" ADD CONSTRAINT "acquisition_program_settings_rates_check" CHECK ("researcher_rate_bps" BETWEEN 0 AND 10000 AND "acquisition_rate_bps" BETWEEN 0 AND 10000 AND "customer_referral_rate_bps" BETWEEN 0 AND 10000 AND "maximum_reward_rate_bps" BETWEEN 0 AND 10000 AND "researcher_rate_bps" + "acquisition_rate_bps" <= "maximum_reward_rate_bps");
ALTER TABLE "acquisition_program_settings" ADD CONSTRAINT "acquisition_program_settings_hold_check" CHECK ("hold_period_days" BETWEEN 0 AND 365 AND "payout_minimum_minor" >= 0);

CREATE TABLE "acquisition_payouts" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "amount_minor" INTEGER NOT NULL CHECK ("amount_minor" > 0),
  "reason" TEXT NOT NULL,
  "recorded_by_employee_id" TEXT NOT NULL,
  "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acquisition_payouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "acquisition_payouts_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_payouts_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_payouts_recorder_fkey" FOREIGN KEY ("recorded_by_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "acquisition_payouts_workspace_employee_approved_idx" ON "acquisition_payouts"("workspace_id", "employee_id", "approved_at");
CREATE TABLE "acquisition_payout_items" (
  "payout_id" TEXT NOT NULL,
  "commission_id" TEXT NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  CONSTRAINT "acquisition_payout_items_pkey" PRIMARY KEY ("payout_id", "commission_id"),
  CONSTRAINT "acquisition_payout_items_commission_unique" UNIQUE ("commission_id"),
  CONSTRAINT "acquisition_payout_items_payout_fkey" FOREIGN KEY ("payout_id") REFERENCES "acquisition_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_payout_items_commission_fkey" FOREIGN KEY ("commission_id") REFERENCES "acquisition_commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "acquisition_payout_payments" (
  "id" TEXT NOT NULL,
  "payout_id" TEXT NOT NULL UNIQUE,
  "payment_reference" TEXT NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recorded_by_employee_id" TEXT NOT NULL,
  CONSTRAINT "acquisition_payout_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "acquisition_payout_payments_payout_fkey" FOREIGN KEY ("payout_id") REFERENCES "acquisition_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_payout_payments_recorder_fkey" FOREIGN KEY ("recorded_by_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE OR REPLACE FUNCTION acquisition_payout_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Acquisition payout records are append-only';
END;
$$;
CREATE TRIGGER acquisition_payouts_immutable BEFORE UPDATE OR DELETE ON "acquisition_payouts" FOR EACH ROW EXECUTE FUNCTION acquisition_payout_immutable();
CREATE TRIGGER acquisition_payout_items_immutable BEFORE UPDATE OR DELETE ON "acquisition_payout_items" FOR EACH ROW EXECUTE FUNCTION acquisition_payout_immutable();
CREATE TRIGGER acquisition_payout_payments_immutable BEFORE UPDATE OR DELETE ON "acquisition_payout_payments" FOR EACH ROW EXECUTE FUNCTION acquisition_payout_immutable();

CREATE TABLE "acquisition_email_templates" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Other',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "created_by_employee_id" TEXT NOT NULL,
  "updated_by_employee_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "acquisition_email_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "acquisition_email_templates_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_email_templates_creator_fkey" FOREIGN KEY ("created_by_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_email_templates_updater_fkey" FOREIGN KEY ("updated_by_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_email_templates_slug_unique" UNIQUE ("workspace_id", "slug")
);
CREATE INDEX "acquisition_email_templates_workspace_status_category_idx" ON "acquisition_email_templates"("workspace_id", "status", "category");
ALTER TABLE "acquisition_email_templates" ADD CONSTRAINT "acquisition_email_templates_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED'));
CREATE TABLE "acquisition_email_events" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "prospect_id" TEXT NOT NULL,
  "template_id" TEXT,
  "created_by_employee_id" TEXT NOT NULL,
  "recipient_email" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "event_key" TEXT NOT NULL UNIQUE,
  "provider_message_id" TEXT,
  "provider_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  CONSTRAINT "acquisition_email_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "acquisition_email_events_workspace_fkey" FOREIGN KEY ("workspace_id") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_email_events_prospect_fkey" FOREIGN KEY ("prospect_id") REFERENCES "team_prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_email_events_template_fkey" FOREIGN KEY ("template_id") REFERENCES "acquisition_email_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "acquisition_email_events_creator_fkey" FOREIGN KEY ("created_by_employee_id") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "acquisition_email_events_workspace_status_created_idx" ON "acquisition_email_events"("workspace_id", "status", "created_at");
CREATE INDEX "acquisition_email_events_prospect_recipient_created_idx" ON "acquisition_email_events"("prospect_id", "recipient_email", "created_at");
ALTER TABLE "acquisition_email_events" ADD CONSTRAINT "acquisition_email_events_status_check" CHECK ("status" IN ('DRAFT','QUEUED','SENT','FAILED','BOUNCED','UNSUBSCRIBED'));
