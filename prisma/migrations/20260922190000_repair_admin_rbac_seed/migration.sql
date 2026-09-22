-- Restore idempotent RBAC seed data for databases whose historical schema was
-- baselined without executing the data statements from 20260726210000_admin_rbac.
INSERT INTO "admin_permissions" ("key", "description") VALUES
  ('releases.read', 'View release records and review context'),
  ('releases.review', 'Review release submissions'),
  ('releases.override', 'Override release workflow decisions'),
  ('distribution.submit', 'Submit releases for distribution'),
  ('distribution.retry', 'Retry failed distribution operations'),
  ('distribution.confirm_status', 'Confirm distributor delivery status'),
  ('updates.review', 'Review release update requests'),
  ('takedowns.review', 'Review takedown requests'),
  ('royalties.import', 'Import royalty reports'),
  ('royalties.reconcile', 'Reconcile royalty statements'),
  ('wallets.adjust', 'Create audited wallet adjustments'),
  ('payouts.review', 'Review payout requests'),
  ('payouts.approve', 'Approve payout requests'),
  ('payouts.mark_paid', 'Record payout completion'),
  ('kyc.review', 'Review payout identity verification'),
  ('fraud.read', 'View fraud monitoring data'),
  ('fraud.manage', 'Manage fraud investigations'),
  ('fraud.rules', 'Manage fraud rules'),
  ('users.read', 'View users and access assignments'),
  ('users.manage', 'Manage user workspace access and account status'),
  ('services.manage', 'Manage artist services'),
  ('audit.read', 'View administrator audit history'),
  ('system.manage', 'Manage administrator roles and system settings')
ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";

INSERT INTO "admin_roles" ("key", "name", "description", "updated_at") VALUES
  ('super_admin', 'Super admin', 'Full platform and administrator access.', CURRENT_TIMESTAMP),
  ('qc_reviewer', 'QC reviewer', 'Release quality-control review.', CURRENT_TIMESTAMP),
  ('distribution_operator', 'Distribution operator', 'Distributor submission and delivery operations.', CURRENT_TIMESTAMP),
  ('finance_operator', 'Finance operator', 'Royalty reconciliation and wallet operations.', CURRENT_TIMESTAMP),
  ('payout_approver', 'Payout approver', 'Payout approval and KYC review.', CURRENT_TIMESTAMP),
  ('support_agent', 'Support agent', 'Read-only user and release support context.', CURRENT_TIMESTAMP),
  ('rights_operator', 'Rights operator', 'Updates, takedowns, and managed-service operations.', CURRENT_TIMESTAMP),
  ('read_only_auditor', 'Read-only auditor', 'Read-only release and audit access.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;

WITH grants(role_key, permission_key) AS (VALUES
  ('qc_reviewer', 'releases.read'), ('qc_reviewer', 'releases.review'),
  ('distribution_operator', 'releases.read'), ('distribution_operator', 'distribution.submit'), ('distribution_operator', 'distribution.retry'), ('distribution_operator', 'distribution.confirm_status'),
  ('finance_operator', 'royalties.import'), ('finance_operator', 'royalties.reconcile'), ('finance_operator', 'wallets.adjust'), ('finance_operator', 'payouts.review'),
  ('payout_approver', 'payouts.review'), ('payout_approver', 'payouts.approve'), ('payout_approver', 'payouts.mark_paid'), ('payout_approver', 'kyc.review'),
  ('support_agent', 'releases.read'), ('support_agent', 'users.read'),
  ('rights_operator', 'releases.read'), ('rights_operator', 'updates.review'), ('rights_operator', 'takedowns.review'), ('rights_operator', 'services.manage'),
  ('read_only_auditor', 'releases.read'), ('read_only_auditor', 'audit.read')
)
INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM grants
JOIN "admin_roles" role ON role."key" = grants.role_key
JOIN "admin_permissions" permission ON permission."key" = grants.permission_key
ON CONFLICT DO NOTHING;

INSERT INTO "admin_role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "admin_roles" role
CROSS JOIN "admin_permissions" permission
WHERE role."key" = 'super_admin'
ON CONFLICT DO NOTHING;

-- Preserve the historical behavior: existing ADMIN users become super admins.
INSERT INTO "admin_memberships" ("user_id", "role_id", "active", "updated_at")
SELECT user_record."id", role."id", true, CURRENT_TIMESTAMP
FROM "users" user_record
CROSS JOIN "admin_roles" role
WHERE user_record."role" = 'ADMIN' AND role."key" = 'super_admin'
ON CONFLICT ("user_id") DO NOTHING;
