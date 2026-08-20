ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mobile" TEXT,
  ADD COLUMN IF NOT EXISTS "contact_email" TEXT,
  ADD COLUMN IF NOT EXISTS "date_of_birth" DATE,
  ADD COLUMN IF NOT EXISTS "preferred_language" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS "onboarding_purpose" TEXT,
  ADD COLUMN IF NOT EXISTS "onboarding_user_type" TEXT,
  ADD COLUMN IF NOT EXISTS "referral_source" TEXT,
  ADD COLUMN IF NOT EXISTS "onboarding_referral_code" TEXT,
  ADD COLUMN IF NOT EXISTS "onboarding_completed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboarding_preferences" JSONB;
