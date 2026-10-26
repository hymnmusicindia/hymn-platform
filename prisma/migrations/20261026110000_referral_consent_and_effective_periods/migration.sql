-- Retain recipient identities and earned ledger rows across voluntary removal.
ALTER TABLE referrals ADD COLUMN active_recipient_id INTEGER,
  ADD COLUMN accepted_at TIMESTAMP(3), ADD COLUMN ended_at TIMESTAMP(3);
DROP INDEX referrals_referred_user_id_key;
UPDATE referrals SET active_recipient_id = referred_user_id;
CREATE UNIQUE INDEX referrals_active_recipient_id_key ON referrals(active_recipient_id);
CREATE INDEX referrals_referred_user_id_created_at_idx ON referrals(referred_user_id, "created_at");
ALTER TABLE acquisition_leads ADD COLUMN referral_accepted_at TIMESTAMP(3),
  ADD COLUMN referral_ended_at TIMESTAMP(3), ADD COLUMN referral_only BOOLEAN NOT NULL DEFAULT false;
-- Legacy records remain identifiable as legacy: no invented customer consent.
CREATE UNIQUE INDEX acquisition_leads_one_approved_referral_per_customer
  ON acquisition_leads(customer_id) WHERE referral_accepted_at IS NOT NULL AND referral_ended_at IS NULL AND customer_id IS NOT NULL;
ALTER TABLE referral_mail_jobs ADD COLUMN last_error TEXT;
-- Grandfather actual historical attribution without inventing customer approval.
ALTER TABLE acquisition_leads ADD COLUMN requires_referral_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE acquisition_leads ALTER COLUMN requires_referral_consent SET DEFAULT true;
ALTER TABLE acquisition_leads ADD COLUMN referral_history JSONB NOT NULL DEFAULT '[]';
