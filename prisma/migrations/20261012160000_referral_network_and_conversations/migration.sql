-- Preserve existing earnings and expand idempotency to one entry per beneficiary.
ALTER TABLE referrals ADD COLUMN owner_read_at TIMESTAMP(3), ADD COLUMN follower_read_at TIMESTAMP(3), ADD COLUMN owner_blocked BOOLEAN NOT NULL DEFAULT false, ADD COLUMN follower_blocked BOOLEAN NOT NULL DEFAULT false;
DROP INDEX referral_commissions_payment_id_key;
DROP INDEX referral_commissions_source_type_source_id_key;
ALTER TABLE referral_commissions ADD COLUMN level INTEGER NOT NULL DEFAULT 1, ADD COLUMN origin_referral_id INTEGER;
UPDATE referral_commissions SET origin_referral_id = referral_id;
ALTER TABLE referral_commissions ADD CONSTRAINT referral_commissions_origin_referral_id_fkey FOREIGN KEY (origin_referral_id) REFERENCES referrals(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE referral_commissions ADD CONSTRAINT referral_commission_level_check CHECK (level BETWEEN 1 AND 7);
CREATE UNIQUE INDEX referral_commissions_payment_id_referral_id_key ON referral_commissions(payment_id,referral_id);
CREATE UNIQUE INDEX referral_commissions_source_type_source_id_referral_id_key ON referral_commissions(source_type,source_id,referral_id);
CREATE TABLE referral_messages (id SERIAL PRIMARY KEY, referral_id INTEGER NOT NULL REFERENCES referrals(id) ON DELETE RESTRICT ON UPDATE CASCADE, sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE, body VARCHAR(2000) NOT NULL, client_key TEXT NOT NULL, created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), CONSTRAINT referral_message_body_check CHECK (length(btrim(body)) BETWEEN 1 AND 2000));
CREATE UNIQUE INDEX referral_messages_referral_id_sender_id_client_key_key ON referral_messages(referral_id,sender_id,client_key);
CREATE INDEX referral_messages_referral_id_id_idx ON referral_messages(referral_id,id);
CREATE TABLE referral_mail_jobs (id SERIAL PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,subject TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',attempts INTEGER NOT NULL DEFAULT 0,available_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),locked_at TIMESTAMP(3),sent_at TIMESTAMP(3),created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'));
CREATE INDEX referral_mail_jobs_status_available_at_idx ON referral_mail_jobs(status,available_at);
ALTER TABLE referral_program ADD COLUMN network_effective_at TIMESTAMP(3);
UPDATE referral_program SET network_effective_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
