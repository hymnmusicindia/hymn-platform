-- Non-destructive release review fields for rejection and correction workflows.
ALTER TABLE releases ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS correction_reason TEXT;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS review_issues JSONB;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS admin_internal_note TEXT;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP(3);
ALTER TABLE releases ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
