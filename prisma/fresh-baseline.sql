-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'PRODUCER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'BANNED');

-- CreateEnum
CREATE TYPE "ProducerApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'AWAITING_PAYMENT', 'SUBMITTED', 'IN_QUEUE', 'IN_QC_QUEUE', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'RESUBMITTED', 'APPROVED', 'QUEUED_FOR_DISTRIBUTION', 'SUBMITTING_TO_DISTRIBUTOR', 'SENT_TO_DISTRIBUTOR', 'DISTRIBUTOR_PROCESSING', 'DISTRIBUTOR_CHANGES_REQUIRED', 'SCHEDULED', 'PROCESSING', 'AWAITING_LIVE_CONFIRMATION', 'PARTIALLY_LIVE', 'DELIVERED', 'SENT', 'LIVE', 'DISTRIBUTED', 'REJECTED', 'FAILED', 'DELIVERY_FAILED', 'TAKEDOWN_REQUESTED', 'TAKEDOWN_PROCESSING', 'TAKEN_DOWN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('AUDIO', 'ARTWORK', 'BEAT', 'DOCUMENT', 'SAMPLE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PayoutRequestMethod" AS ENUM ('UPI', 'BANK');

-- CreateEnum
CREATE TYPE "PayoutRequestStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "google_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "onboarding_done" BOOLEAN NOT NULL DEFAULT false,
    "mobile" TEXT,
    "contact_email" TEXT,
    "date_of_birth" DATE,
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "onboarding_purpose" TEXT,
    "onboarding_user_type" TEXT,
    "referral_source" TEXT,
    "onboarding_referral_code" TEXT,
    "onboarding_completed_at" TIMESTAMP(3),
    "onboarding_preferences" JSONB,
    "referral_code" TEXT,
    "referral_credits" INTEGER NOT NULL DEFAULT 0,
    "referred_by" INTEGER,
    "first_payment_rewarded" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producer_applications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "producer_name" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "portfolio_links" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instagram" TEXT,
    "youtube" TEXT,
    "soundcloud" TEXT,
    "spotify" TEXT,
    "years_experience" INTEGER NOT NULL,
    "pricing" TEXT NOT NULL,
    "sample_beats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bio" TEXT NOT NULL,
    "status" "ProducerApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "internal_notes" TEXT,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "releases" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "artist_name" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "collaborators" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "producer" TEXT,
    "bpm" INTEGER,
    "explicit" BOOLEAN NOT NULL DEFAULT false,
    "release_date" TIMESTAMP(3) NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "distributor_release_id" TEXT,
    "upc_code" TEXT,
    "rejection_reason" TEXT,
    "correction_reason" TEXT,
    "review_issues" JSONB,
    "admin_internal_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "release_type" TEXT,
    "artwork_url" TEXT,
    "audio_url" TEXT,
    "payment_status" TEXT DEFAULT 'pending',
    "metadata" JSONB,
    "draft_completion_percent" INTEGER NOT NULL DEFAULT 0,
    "last_edited_at" TIMESTAMP(3),
    "missing_fields" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "duration" INTEGER,
    "isrc" TEXT,
    "distributor_status" TEXT,
    "audio_upload_id" INTEGER,
    "track_number" INTEGER,
    "audio_url" TEXT,
    "primary_artist" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_permissions" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "admin_memberships" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_status_transitions" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "previous_status" "ReleaseStatus" NOT NULL,
    "new_status" "ReleaseStatus" NOT NULL,
    "actor_id" INTEGER,
    "actor_type" TEXT NOT NULL,
    "reason" TEXT,
    "request_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_status_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_submission_attempts" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'direnote',
    "idempotency_key" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'processing',
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "provider_reference" TEXT,
    "http_status" INTEGER,
    "safe_error" TEXT,
    "response_redacted" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distribution_submission_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_change_requests" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "requested_by_user_id" INTEGER NOT NULL,
    "request_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "reason" TEXT NOT NULL,
    "desired_effective_at" TIMESTAMP(3),
    "requested_changes" JSONB,
    "provider_reference" TEXT,
    "admin_note" TEXT,
    "reviewed_by_admin_id" INTEGER,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_change_request_events" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" INTEGER,
    "previous_status" TEXT,
    "new_status" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "provider_reference" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_change_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_service_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "release_id" INTEGER NOT NULL,
    "track_id" INTEGER,
    "service_type" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "eligibility_answers" JSONB NOT NULL,
    "declarations" JSONB,
    "public_links" JSONB,
    "risk_flags" JSONB,
    "internal_notes" TEXT,
    "user_visible_update" TEXT,
    "assigned_admin_id" INTEGER,
    "external_reference" TEXT,
    "rejection_reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managed_service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_service_provider_statuses" (
    "id" SERIAL NOT NULL,
    "request_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "managed_service_provider_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managed_service_documents" (
    "request_id" INTEGER NOT NULL,
    "asset_id" INTEGER NOT NULL,

    CONSTRAINT "managed_service_documents_pkey" PRIMARY KEY ("request_id","asset_id")
);

-- CreateTable
CREATE TABLE "spotify_admin_connections" (
    "id" INTEGER NOT NULL,
    "spotify_user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotify_admin_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direnote_logs" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER,
    "action" TEXT NOT NULL,
    "http_status" INTEGER,
    "success" BOOLEAN NOT NULL,
    "request_payload_redacted" JSONB,
    "response_raw" TEXT,
    "response_json" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_admin_id" INTEGER,

    CONSTRAINT "direnote_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_tasks" (
    "id" SERIAL NOT NULL,
    "event_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigned_to" INTEGER,
    "resolution_note" TEXT,
    "snoozed_until" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_task_history" (
    "id" SERIAL NOT NULL,
    "task_id" INTEGER NOT NULL,
    "actor_id" INTEGER,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_task_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "release_id" INTEGER,
    "kind" "UploadKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "public_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "streams" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "revenue_cents" INTEGER NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "data_source" TEXT NOT NULL,
    "statement_period" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalties" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "release_id" INTEGER,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "source" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "service_fee" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "source_type" TEXT NOT NULL DEFAULT 'artist_royalty',
    "method" "PayoutRequestMethod" NOT NULL,
    "upi_id" TEXT,
    "account_holder_name" TEXT,
    "bank_account_number" TEXT,
    "ifsc" TEXT,
    "status" "PayoutRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "user_note" TEXT,
    "admin_note" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "payment_reference" TEXT,
    "payment_method" TEXT,
    "payment_date" TIMESTAMP(3),
    "paid_amount" DECIMAL(12,2),
    "proof_asset_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_request_events" (
    "id" SERIAL NOT NULL,
    "payout_request_id" INTEGER NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" INTEGER,
    "previous_status" TEXT,
    "new_status" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_payout_balances" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "available_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "pending_balance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lifetime_earnings" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "lifetime_paid" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_payout_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_line_items" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "release_id" INTEGER,
    "track_id" INTEGER,
    "upc" TEXT,
    "isrc" TEXT,
    "platform" TEXT NOT NULL,
    "territory" TEXT,
    "gross_revenue" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "hymn_service_fee" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "net_revenue" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "streams" INTEGER,
    "downloads" INTEGER,
    "statement_month" TIMESTAMP(3) NOT NULL,
    "raw_metadata" JSONB,
    "source_key" TEXT,
    "statement_id" INTEGER,
    "source_line_number" INTEGER,
    "original_values" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_statements" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "file_checksum" TEXT NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "stored_asset_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'staged',
    "imported_by_user_id" INTEGER NOT NULL,
    "imported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_import_jobs" (
    "id" SERIAL NOT NULL,
    "statement_id" INTEGER NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'staged',
    "idempotency_key" TEXT NOT NULL,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "unmatched_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "safe_error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "royalty_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_adjustments" (
    "id" SERIAL NOT NULL,
    "statement_id" INTEGER NOT NULL,
    "royalty_line_item_id" INTEGER,
    "amount" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "reversal_of_id" INTEGER,
    "created_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "royalty_allocations" (
    "id" SERIAL NOT NULL,
    "royalty_line_item_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "gross_amount" DECIMAL(18,6) NOT NULL,
    "commission_amount" DECIMAL(18,6) NOT NULL,
    "allocated_amount" DECIMAL(18,6) NOT NULL,
    "held_amount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_assets" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "release_id" INTEGER,
    "beat_id" INTEGER,
    "beat_purchase_id" INTEGER,
    "asset_type" TEXT NOT NULL,
    "storage_provider" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "safe_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "access_classification" TEXT NOT NULL,
    "upload_status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "retention_until" TIMESTAMP(3),

    CONSTRAINT "stored_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_records" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "track_id" INTEGER,
    "owner_user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "effective_from_month" INTEGER,
    "effective_from_year" INTEGER,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "split_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_recipients" (
    "id" SERIAL NOT NULL,
    "split_record_id" INTEGER NOT NULL,
    "release_id" INTEGER NOT NULL,
    "track_id" INTEGER,
    "recipient_user_id" INTEGER,
    "recipient_email" TEXT,
    "recipient_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "share_percent" DECIMAL(5,2) NOT NULL,
    "payout_eligible" BOOLEAN NOT NULL DEFAULT true,
    "invite_method" TEXT NOT NULL,
    "invite_status" TEXT NOT NULL DEFAULT 'pending',
    "split_code_hash" TEXT,
    "split_code_display" TEXT,
    "split_code_expires_at" TIMESTAMP(3),
    "split_code_used_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "split_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_credentials" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "upi_id_masked" TEXT,
    "upi_id_encrypted" TEXT,
    "account_holder_name" TEXT,
    "bank_account_masked" TEXT,
    "bank_account_encrypted" TEXT,
    "ifsc_masked" TEXT,
    "ifsc_encrypted" TEXT,
    "tax_info_encrypted" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "legal_name" TEXT,
    "country" TEXT,
    "tax_residency" TEXT,
    "pan_last_four" TEXT,
    "rejection_reason" TEXT,
    "verification_note" TEXT,
    "submitted_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3),
    "verified_by_admin_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_earning_line_items" (
    "id" SERIAL NOT NULL,
    "royalty_line_item_id" INTEGER NOT NULL,
    "split_record_id" INTEGER NOT NULL,
    "recipient_user_id" INTEGER,
    "recipient_email" TEXT,
    "recipient_name" TEXT NOT NULL,
    "recipient_role" TEXT NOT NULL,
    "release_id" INTEGER NOT NULL,
    "track_id" INTEGER,
    "share_percent" DECIMAL(5,2) NOT NULL,
    "gross_share_amount" DECIMAL(12,2) NOT NULL,
    "net_share_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'held',
    "reversal_of_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "split_earning_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "balance_after" DECIMAL(18,6) NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'credit',
    "idempotency_key" TEXT,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availability_status" TEXT NOT NULL DEFAULT 'available',
    "audit_metadata" JSONB,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_adjustments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reason" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "requested_by" INTEGER NOT NULL,
    "approved_by" INTEGER,
    "decision_note" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_rate_limits" (
    "key_hash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_rate_limits_pkey" PRIMARY KEY ("key_hash")
);

-- CreateTable
CREATE TABLE "payout_periods" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "month" INTEGER,
    "quarter" INTEGER,
    "year" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "total_gross_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_artist_pool" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_split_earnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_held_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_requested_payout" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_carry_forward" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "generated_report_url" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_admin_id" INTEGER,
    "close_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarter_carry_forwards" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "from_quarter" INTEGER NOT NULL,
    "from_year" INTEGER NOT NULL,
    "to_quarter" INTEGER NOT NULL,
    "to_year" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarter_carry_forwards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_reports" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "user_id" INTEGER,
    "month" INTEGER,
    "quarter" INTEGER,
    "year" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT,
    "generated_by_admin_id" INTEGER,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "checksum" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unmatched_royalty_rows" (
    "id" SERIAL NOT NULL,
    "source_key" TEXT NOT NULL,
    "statement_id" INTEGER,
    "source_line_number" INTEGER,
    "matched_release_id" INTEGER,
    "matched_track_id" INTEGER,
    "import_reference" TEXT,
    "statement_month" TIMESTAMP(3),
    "upc" TEXT,
    "isrc" TEXT,
    "raw_data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unmatched',
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "royalty_line_item_id" INTEGER,

    CONSTRAINT "unmatched_royalty_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'system',
    "href" TEXT,
    "action_label" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "metadata" JSONB,
    "event_key" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'resend',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "payload" JSONB,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "plan" TEXT NOT NULL,
    "plan_name" TEXT,
    "expiry" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releases_used" INTEGER NOT NULL DEFAULT 0,
    "release_limit" INTEGER,
    "artist_limit" INTEGER NOT NULL DEFAULT 5,
    "available_features" TEXT NOT NULL DEFAULT '[]',
    "days_remaining" INTEGER NOT NULL DEFAULT 0,
    "auto_renewal" BOOLEAN NOT NULL DEFAULT true,
    "next_renewal_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "category" TEXT NOT NULL DEFAULT 'general',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "related_release_id" INTEGER,
    "related_purchase_id" INTEGER,
    "related_payout_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "actor_type" TEXT NOT NULL DEFAULT 'system',
    "actor_id" INTEGER,
    "actor_role" TEXT NOT NULL DEFAULT 'unknown',
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "previous_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "request_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "session_id" TEXT,
    "risk_level" TEXT NOT NULL DEFAULT 'normal',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "referred_user_id" INTEGER,
    "referral_code" TEXT NOT NULL,
    "signup_email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'signed_up',
    "purchase_amount" INTEGER NOT NULL DEFAULT 0,
    "earnings" INTEGER NOT NULL DEFAULT 0,
    "rewarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beats" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "bpm" INTEGER NOT NULL,
    "genre" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "key_signature" TEXT NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "audio_upload_id" INTEGER,
    "artwork_upload_id" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "review_issues" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producer_profiles" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "cover_photo_url" TEXT,
    "avatar_url" TEXT,
    "instagram_url" TEXT,
    "youtube_url" TEXT,
    "spotify_url" TEXT,
    "website_url" TEXT,
    "tags" JSONB,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_setup',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beat_sales" (
    "id" SERIAL NOT NULL,
    "beat_id" INTEGER NOT NULL,
    "producer_user_id" INTEGER NOT NULL,
    "buyer_user_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "payment_id" TEXT NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "hymn_commission_amount" DECIMAL(12,2) NOT NULL,
    "producer_earning_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "license_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beat_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "discount_percentage" INTEGER NOT NULL,
    "max_uses" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discount_type" TEXT NOT NULL DEFAULT 'percentage',
    "discount_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expiry_date" TIMESTAMP(3),
    "usage_limit" INTEGER,
    "per_user_limit" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_orders" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL DEFAULT 'beatstore',
    "original_price" DECIMAL(12,2) NOT NULL,
    "discount_applied" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "referral_credits_used" INTEGER NOT NULL DEFAULT 0,
    "final_amount" DECIMAL(12,2) NOT NULL,
    "coupon_code" TEXT,
    "razorpay_order_id" TEXT NOT NULL,
    "razorpay_payment_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payment_status" TEXT NOT NULL DEFAULT 'created',
    "fulfilled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "beat_id" INTEGER NOT NULL,
    "license_type" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "license_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" SERIAL NOT NULL,
    "coupon_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_orders" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "plan" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "razorpay_order_id" TEXT NOT NULL,
    "razorpay_payment_id" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'created',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "fulfilled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhook_events" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'razorpay',
    "provider_event_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "processing_state" TEXT NOT NULL DEFAULT 'received',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "distribution_order_id" INTEGER,
    "checkout_order_id" INTEGER,
    "razorpay_order_id" TEXT,
    "payment_id" TEXT,
    "amount_minor" INTEGER,
    "currency" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "payload_redacted" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_cards" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "artist_name" TEXT NOT NULL,
    "spotify_profile_url" TEXT,
    "spotify_artist_id" TEXT,
    "apple_music_profile_url" TEXT,
    "apple_artist_id" TEXT,
    "instagram_url" TEXT,
    "youtube_url" TEXT,
    "image_url" TEXT,
    "followers" INTEGER,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artist_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beat_purchases" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "beat_id" INTEGER NOT NULL,
    "license_type" TEXT NOT NULL,
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "license_uploaded_at" TIMESTAMP(3),
    "license_url" TEXT,
    "release_id" INTEGER,
    "payment_id" TEXT,
    "checkout_order_item_id" INTEGER,
    "has_access" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beat_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_queue_entries" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "current_stage" TEXT NOT NULL,
    "quality_check_notes" TEXT,
    "approval_notes" TEXT,
    "direnote_request_id" TEXT,
    "direnote_response" JSONB,
    "submission_id" TEXT,
    "api_error_message" TEXT,
    "stage_history" JSONB,
    "timestamps" JSONB,
    "operator_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "distribution_queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_queue_logs" (
    "id" SERIAL NOT NULL,
    "queue_entry_id" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "stage_start_time" TIMESTAMP(3) NOT NULL,
    "stage_end_time" TIMESTAMP(3),
    "operator_id" INTEGER,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_queue_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "producer_applications_status_created_at_idx" ON "producer_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "releases_user_id_status_idx" ON "releases"("user_id", "status");

-- CreateIndex
CREATE INDEX "releases_status_created_at_idx" ON "releases"("status", "created_at");

-- CreateIndex
CREATE INDEX "releases_distributor_release_id_idx" ON "releases"("distributor_release_id");

-- CreateIndex
CREATE INDEX "releases_upc_code_idx" ON "releases"("upc_code");

-- CreateIndex
CREATE INDEX "tracks_isrc_idx" ON "tracks"("isrc");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_key_key" ON "admin_roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "admin_permissions_key_key" ON "admin_permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "admin_memberships_user_id_key" ON "admin_memberships"("user_id");

-- CreateIndex
CREATE INDEX "admin_memberships_role_id_active_idx" ON "admin_memberships"("role_id", "active");

-- CreateIndex
CREATE INDEX "release_status_transitions_release_id_created_at_idx" ON "release_status_transitions"("release_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_submission_attempts_idempotency_key_key" ON "distribution_submission_attempts"("idempotency_key");

-- CreateIndex
CREATE INDEX "distribution_submission_attempts_release_id_state_updated_a_idx" ON "distribution_submission_attempts"("release_id", "state", "updated_at");

-- CreateIndex
CREATE INDEX "distribution_submission_attempts_provider_state_updated_at_idx" ON "distribution_submission_attempts"("provider", "state", "updated_at");

-- CreateIndex
CREATE INDEX "release_change_requests_release_id_request_type_status_idx" ON "release_change_requests"("release_id", "request_type", "status");

-- CreateIndex
CREATE INDEX "release_change_requests_status_submitted_at_idx" ON "release_change_requests"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "release_change_request_events_request_id_created_at_idx" ON "release_change_request_events"("request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "managed_service_requests_idempotency_key_key" ON "managed_service_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "managed_service_requests_user_id_service_type_submitted_at_idx" ON "managed_service_requests"("user_id", "service_type", "submitted_at");

-- CreateIndex
CREATE INDEX "managed_service_requests_service_type_status_submitted_at_idx" ON "managed_service_requests"("service_type", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "managed_service_requests_release_id_track_id_idx" ON "managed_service_requests"("release_id", "track_id");

-- CreateIndex
CREATE INDEX "managed_service_provider_statuses_status_updated_at_idx" ON "managed_service_provider_statuses"("status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "managed_service_provider_statuses_request_id_provider_key" ON "managed_service_provider_statuses"("request_id", "provider");

-- CreateIndex
CREATE INDEX "managed_service_documents_asset_id_idx" ON "managed_service_documents"("asset_id");

-- CreateIndex
CREATE INDEX "direnote_logs_release_id_created_at_idx" ON "direnote_logs"("release_id", "created_at");

-- CreateIndex
CREATE INDEX "direnote_logs_action_created_at_idx" ON "direnote_logs"("action", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_tasks_event_key_key" ON "admin_tasks"("event_key");

-- CreateIndex
CREATE INDEX "admin_tasks_status_priority_created_at_idx" ON "admin_tasks"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "admin_tasks_entity_type_entity_id_idx" ON "admin_tasks"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "admin_task_history_task_id_created_at_idx" ON "admin_task_history"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "uploads_user_id_kind_idx" ON "uploads"("user_id", "kind");

-- CreateIndex
CREATE INDEX "analytics_release_id_period_start_idx" ON "analytics"("release_id", "period_start");

-- CreateIndex
CREATE INDEX "analytics_is_verified_period_start_period_end_idx" ON "analytics"("is_verified", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "royalties_user_id_period_start_idx" ON "royalties"("user_id", "period_start");

-- CreateIndex
CREATE INDEX "payouts_status_created_at_idx" ON "payouts"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_requests_payment_reference_key" ON "payout_requests"("payment_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payout_requests_proof_asset_id_key" ON "payout_requests"("proof_asset_id");

-- CreateIndex
CREATE INDEX "payout_requests_user_id_status_idx" ON "payout_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "payout_requests_status_requested_at_idx" ON "payout_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "payout_request_events_payout_request_id_created_at_idx" ON "payout_request_events"("payout_request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "artist_payout_balances_user_id_key" ON "artist_payout_balances"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_line_items_source_key_key" ON "royalty_line_items"("source_key");

-- CreateIndex
CREATE INDEX "royalty_line_items_user_id_statement_month_idx" ON "royalty_line_items"("user_id", "statement_month");

-- CreateIndex
CREATE INDEX "royalty_line_items_release_id_idx" ON "royalty_line_items"("release_id");

-- CreateIndex
CREATE INDEX "royalty_line_items_track_id_idx" ON "royalty_line_items"("track_id");

-- CreateIndex
CREATE INDEX "royalty_line_items_statement_id_source_line_number_idx" ON "royalty_line_items"("statement_id", "source_line_number");

-- CreateIndex
CREATE INDEX "royalty_line_items_isrc_idx" ON "royalty_line_items"("isrc");

-- CreateIndex
CREATE INDEX "royalty_line_items_upc_idx" ON "royalty_line_items"("upc");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_statements_file_checksum_key" ON "royalty_statements"("file_checksum");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_statements_stored_asset_id_key" ON "royalty_statements"("stored_asset_id");

-- CreateIndex
CREATE INDEX "royalty_statements_provider_period_start_period_end_idx" ON "royalty_statements"("provider", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_import_jobs_idempotency_key_key" ON "royalty_import_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "royalty_import_jobs_state_started_at_idx" ON "royalty_import_jobs"("state", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_adjustments_idempotency_key_key" ON "royalty_adjustments"("idempotency_key");

-- CreateIndex
CREATE INDEX "royalty_adjustments_statement_id_created_at_idx" ON "royalty_adjustments"("statement_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "royalty_allocations_idempotency_key_key" ON "royalty_allocations"("idempotency_key");

-- CreateIndex
CREATE INDEX "royalty_allocations_user_id_created_at_idx" ON "royalty_allocations"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stored_assets_beat_id_key" ON "stored_assets"("beat_id");

-- CreateIndex
CREATE UNIQUE INDEX "stored_assets_beat_purchase_id_key" ON "stored_assets"("beat_purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "stored_assets_object_key_key" ON "stored_assets"("object_key");

-- CreateIndex
CREATE INDEX "stored_assets_owner_user_id_asset_type_created_at_idx" ON "stored_assets"("owner_user_id", "asset_type", "created_at");

-- CreateIndex
CREATE INDEX "stored_assets_release_id_asset_type_idx" ON "stored_assets"("release_id", "asset_type");

-- CreateIndex
CREATE INDEX "stored_assets_deleted_at_retention_until_idx" ON "stored_assets"("deleted_at", "retention_until");

-- CreateIndex
CREATE INDEX "split_records_owner_user_id_status_idx" ON "split_records"("owner_user_id", "status");

-- CreateIndex
CREATE INDEX "split_records_release_id_track_id_status_idx" ON "split_records"("release_id", "track_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "split_recipients_split_code_hash_key" ON "split_recipients"("split_code_hash");

-- CreateIndex
CREATE INDEX "split_recipients_recipient_user_id_invite_status_idx" ON "split_recipients"("recipient_user_id", "invite_status");

-- CreateIndex
CREATE INDEX "split_recipients_recipient_email_invite_status_idx" ON "split_recipients"("recipient_email", "invite_status");

-- CreateIndex
CREATE INDEX "split_recipients_split_record_id_invite_status_idx" ON "split_recipients"("split_record_id", "invite_status");

-- CreateIndex
CREATE UNIQUE INDEX "payout_credentials_user_id_key" ON "payout_credentials"("user_id");

-- CreateIndex
CREATE INDEX "split_earning_line_items_recipient_user_id_status_idx" ON "split_earning_line_items"("recipient_user_id", "status");

-- CreateIndex
CREATE INDEX "split_earning_line_items_release_id_track_id_idx" ON "split_earning_line_items"("release_id", "track_id");

-- CreateIndex
CREATE UNIQUE INDEX "split_earning_line_items_royalty_line_item_id_split_record__key" ON "split_earning_line_items"("royalty_line_item_id", "split_record_id", "recipient_email");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_id_created_at_idx" ON "wallet_transactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_user_id_type_reference_type_reference_i_key" ON "wallet_transactions"("user_id", "type", "reference_type", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_adjustments_idempotency_key_key" ON "financial_adjustments"("idempotency_key");

-- CreateIndex
CREATE INDEX "financial_adjustments_state_requested_at_idx" ON "financial_adjustments"("state", "requested_at");

-- CreateIndex
CREATE INDEX "financial_adjustments_user_id_requested_at_idx" ON "financial_adjustments"("user_id", "requested_at");

-- CreateIndex
CREATE INDEX "security_rate_limits_expires_at_idx" ON "security_rate_limits"("expires_at");

-- CreateIndex
CREATE INDEX "payout_periods_type_year_status_idx" ON "payout_periods"("type", "year", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payout_periods_type_month_quarter_year_key" ON "payout_periods"("type", "month", "quarter", "year");

-- CreateIndex
CREATE INDEX "quarter_carry_forwards_user_id_to_year_to_quarter_idx" ON "quarter_carry_forwards"("user_id", "to_year", "to_quarter");

-- CreateIndex
CREATE UNIQUE INDEX "quarter_carry_forwards_user_id_from_quarter_from_year_to_qu_key" ON "quarter_carry_forwards"("user_id", "from_quarter", "from_year", "to_quarter", "to_year");

-- CreateIndex
CREATE INDEX "payout_reports_type_year_quarter_month_idx" ON "payout_reports"("type", "year", "quarter", "month");

-- CreateIndex
CREATE INDEX "payout_reports_user_id_generated_at_idx" ON "payout_reports"("user_id", "generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "unmatched_royalty_rows_source_key_key" ON "unmatched_royalty_rows"("source_key");

-- CreateIndex
CREATE INDEX "unmatched_royalty_rows_status_statement_month_idx" ON "unmatched_royalty_rows"("status", "statement_month");

-- CreateIndex
CREATE INDEX "unmatched_royalty_rows_statement_id_source_line_number_idx" ON "unmatched_royalty_rows"("statement_id", "source_line_number");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_event_key_key" ON "notifications"("event_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_event_key_key" ON "email_logs"("event_key");

-- CreateIndex
CREATE INDEX "email_logs_status_created_at_idx" ON "email_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_template_created_at_idx" ON "email_logs"("template", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_user_id_created_at_idx" ON "email_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_entity_type_entity_id_idx" ON "email_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_expiry_idx" ON "subscriptions"("status", "expiry");

-- CreateIndex
CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_category_priority_idx" ON "support_tickets"("category", "priority");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_created_at_idx" ON "audit_logs"("entity", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_risk_level_created_at_idx" ON "audit_logs"("risk_level", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "referrals_user_id_status_idx" ON "referrals"("user_id", "status");

-- CreateIndex
CREATE INDEX "beats_user_id_enabled_idx" ON "beats"("user_id", "enabled");

-- CreateIndex
CREATE INDEX "beats_genre_mood_idx" ON "beats"("genre", "mood");

-- CreateIndex
CREATE UNIQUE INDEX "producer_profiles_user_id_key" ON "producer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "producer_profiles_slug_key" ON "producer_profiles"("slug");

-- CreateIndex
CREATE INDEX "producer_profiles_slug_idx" ON "producer_profiles"("slug");

-- CreateIndex
CREATE INDEX "producer_profiles_active_sort_order_idx" ON "producer_profiles"("active", "sort_order");

-- CreateIndex
CREATE INDEX "beat_sales_producer_user_id_created_at_idx" ON "beat_sales"("producer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "beat_sales_buyer_user_id_created_at_idx" ON "beat_sales"("buyer_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "beat_sales_order_id_beat_id_license_type_key" ON "beat_sales"("order_id", "beat_id", "license_type");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_code_idx" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_orders_razorpay_order_id_key" ON "checkout_orders"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_orders_razorpay_payment_id_key" ON "checkout_orders"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "checkout_orders_user_id_payment_status_created_at_idx" ON "checkout_orders"("user_id", "payment_status", "created_at");

-- CreateIndex
CREATE INDEX "checkout_orders_payment_status_created_at_idx" ON "checkout_orders"("payment_status", "created_at");

-- CreateIndex
CREATE INDEX "checkout_order_items_beat_id_created_at_idx" ON "checkout_order_items"("beat_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_order_items_order_id_beat_id_license_type_key" ON "checkout_order_items"("order_id", "beat_id", "license_type");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_order_id_key" ON "coupon_redemptions"("order_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_user_id_idx" ON "coupon_redemptions"("coupon_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_orders_razorpay_order_id_key" ON "distribution_orders"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_orders_razorpay_payment_id_key" ON "distribution_orders"("razorpay_payment_id");

-- CreateIndex
CREATE INDEX "distribution_orders_user_id_payment_status_idx" ON "distribution_orders"("user_id", "payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key" ON "payment_webhook_events"("provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_payload_hash_key" ON "payment_webhook_events"("payload_hash");

-- CreateIndex
CREATE INDEX "payment_webhook_events_processing_state_received_at_idx" ON "payment_webhook_events"("processing_state", "received_at");

-- CreateIndex
CREATE INDEX "payment_webhook_events_razorpay_order_id_idx" ON "payment_webhook_events"("razorpay_order_id");

-- CreateIndex
CREATE INDEX "payment_webhook_events_checkout_order_id_idx" ON "payment_webhook_events"("checkout_order_id");

-- CreateIndex
CREATE INDEX "artist_cards_user_id_idx" ON "artist_cards"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_cards_user_id_artist_name_key" ON "artist_cards"("user_id", "artist_name");

-- CreateIndex
CREATE UNIQUE INDEX "beat_purchases_release_id_key" ON "beat_purchases"("release_id");

-- CreateIndex
CREATE UNIQUE INDEX "beat_purchases_checkout_order_item_id_key" ON "beat_purchases"("checkout_order_item_id");

-- CreateIndex
CREATE INDEX "beat_purchases_user_id_beat_id_license_type_idx" ON "beat_purchases"("user_id", "beat_id", "license_type");

-- CreateIndex
CREATE INDEX "beat_purchases_payment_id_idx" ON "beat_purchases"("payment_id");

-- CreateIndex
CREATE INDEX "beat_purchases_user_id_purchased_at_idx" ON "beat_purchases"("user_id", "purchased_at");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_queue_entries_release_id_key" ON "distribution_queue_entries"("release_id");

-- CreateIndex
CREATE INDEX "distribution_queue_entries_current_stage_updated_at_idx" ON "distribution_queue_entries"("current_stage", "updated_at");

-- CreateIndex
CREATE INDEX "distribution_queue_entries_release_id_idx" ON "distribution_queue_entries"("release_id");

-- CreateIndex
CREATE INDEX "distribution_queue_logs_queue_entry_id_stage_start_time_idx" ON "distribution_queue_logs"("queue_entry_id", "stage_start_time");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_applications" ADD CONSTRAINT "producer_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_applications" ADD CONSTRAINT "producer_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "releases" ADD CONSTRAINT "releases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "admin_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_memberships" ADD CONSTRAINT "admin_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_status_transitions" ADD CONSTRAINT "release_status_transitions_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_submission_attempts" ADD CONSTRAINT "distribution_submission_attempts_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_change_requests" ADD CONSTRAINT "release_change_requests_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "release_change_request_events" ADD CONSTRAINT "release_change_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "release_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_service_requests" ADD CONSTRAINT "managed_service_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_service_requests" ADD CONSTRAINT "managed_service_requests_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_service_provider_statuses" ADD CONSTRAINT "managed_service_provider_statuses_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "managed_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_service_documents" ADD CONSTRAINT "managed_service_documents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "managed_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "managed_service_documents" ADD CONSTRAINT "managed_service_documents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "stored_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direnote_logs" ADD CONSTRAINT "direnote_logs_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics" ADD CONSTRAINT "analytics_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalties" ADD CONSTRAINT "royalties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalties" ADD CONSTRAINT "royalties_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_proof_asset_id_fkey" FOREIGN KEY ("proof_asset_id") REFERENCES "stored_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_request_events" ADD CONSTRAINT "payout_request_events_payout_request_id_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "payout_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_payout_balances" ADD CONSTRAINT "artist_payout_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_line_items" ADD CONSTRAINT "royalty_line_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_line_items" ADD CONSTRAINT "royalty_line_items_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_line_items" ADD CONSTRAINT "royalty_line_items_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_line_items" ADD CONSTRAINT "royalty_line_items_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "royalty_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_statements" ADD CONSTRAINT "royalty_statements_stored_asset_id_fkey" FOREIGN KEY ("stored_asset_id") REFERENCES "stored_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_statements" ADD CONSTRAINT "royalty_statements_imported_by_user_id_fkey" FOREIGN KEY ("imported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_import_jobs" ADD CONSTRAINT "royalty_import_jobs_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "royalty_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_import_jobs" ADD CONSTRAINT "royalty_import_jobs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_adjustments" ADD CONSTRAINT "royalty_adjustments_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "royalty_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_adjustments" ADD CONSTRAINT "royalty_adjustments_royalty_line_item_id_fkey" FOREIGN KEY ("royalty_line_item_id") REFERENCES "royalty_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_allocations" ADD CONSTRAINT "royalty_allocations_royalty_line_item_id_fkey" FOREIGN KEY ("royalty_line_item_id") REFERENCES "royalty_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "royalty_allocations" ADD CONSTRAINT "royalty_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_assets" ADD CONSTRAINT "stored_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_assets" ADD CONSTRAINT "stored_assets_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_assets" ADD CONSTRAINT "stored_assets_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_assets" ADD CONSTRAINT "stored_assets_beat_purchase_id_fkey" FOREIGN KEY ("beat_purchase_id") REFERENCES "beat_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_records" ADD CONSTRAINT "split_records_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_records" ADD CONSTRAINT "split_records_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_records" ADD CONSTRAINT "split_records_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_recipients" ADD CONSTRAINT "split_recipients_split_record_id_fkey" FOREIGN KEY ("split_record_id") REFERENCES "split_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_recipients" ADD CONSTRAINT "split_recipients_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_recipients" ADD CONSTRAINT "split_recipients_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_recipients" ADD CONSTRAINT "split_recipients_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_credentials" ADD CONSTRAINT "payout_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_earning_line_items" ADD CONSTRAINT "split_earning_line_items_royalty_line_item_id_fkey" FOREIGN KEY ("royalty_line_item_id") REFERENCES "royalty_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_earning_line_items" ADD CONSTRAINT "split_earning_line_items_split_record_id_fkey" FOREIGN KEY ("split_record_id") REFERENCES "split_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_earning_line_items" ADD CONSTRAINT "split_earning_line_items_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_earning_line_items" ADD CONSTRAINT "split_earning_line_items_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_earning_line_items" ADD CONSTRAINT "split_earning_line_items_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quarter_carry_forwards" ADD CONSTRAINT "quarter_carry_forwards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unmatched_royalty_rows" ADD CONSTRAINT "unmatched_royalty_rows_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "royalty_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unmatched_royalty_rows" ADD CONSTRAINT "unmatched_royalty_rows_matched_release_id_fkey" FOREIGN KEY ("matched_release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unmatched_royalty_rows" ADD CONSTRAINT "unmatched_royalty_rows_matched_track_id_fkey" FOREIGN KEY ("matched_track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unmatched_royalty_rows" ADD CONSTRAINT "unmatched_royalty_rows_royalty_line_item_id_fkey" FOREIGN KEY ("royalty_line_item_id") REFERENCES "royalty_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beats" ADD CONSTRAINT "beats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beats" ADD CONSTRAINT "beats_audio_upload_id_fkey" FOREIGN KEY ("audio_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beats" ADD CONSTRAINT "beats_artwork_upload_id_fkey" FOREIGN KEY ("artwork_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_profiles" ADD CONSTRAINT "producer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beat_sales" ADD CONSTRAINT "beat_sales_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beat_sales" ADD CONSTRAINT "beat_sales_producer_user_id_fkey" FOREIGN KEY ("producer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beat_sales" ADD CONSTRAINT "beat_sales_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_order_items" ADD CONSTRAINT "checkout_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "checkout_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_order_items" ADD CONSTRAINT "checkout_order_items_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "checkout_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_orders" ADD CONSTRAINT "distribution_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_distribution_order_id_fkey" FOREIGN KEY ("distribution_order_id") REFERENCES "distribution_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_checkout_order_id_fkey" FOREIGN KEY ("checkout_order_id") REFERENCES "checkout_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_cards" ADD CONSTRAINT "artist_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beat_purchases" ADD CONSTRAINT "beat_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beat_purchases" ADD CONSTRAINT "beat_purchases_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beat_purchases" ADD CONSTRAINT "beat_purchases_checkout_order_item_id_fkey" FOREIGN KEY ("checkout_order_item_id") REFERENCES "checkout_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_queue_entries" ADD CONSTRAINT "distribution_queue_entries_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_queue_logs" ADD CONSTRAINT "distribution_queue_logs_queue_entry_id_fkey" FOREIGN KEY ("queue_entry_id") REFERENCES "distribution_queue_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw-SQL invariants that Prisma's datamodel cannot represent.
CREATE UNIQUE INDEX "payout_requests_one_active_per_user_idx" ON "payout_requests"("user_id") WHERE "status" IN ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING');
CREATE OR REPLACE FUNCTION hymn_reject_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit logs are append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "audit_logs_no_update" BEFORE UPDATE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION hymn_reject_audit_mutation();
CREATE TRIGGER "audit_logs_no_delete" BEFORE DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION hymn_reject_audit_mutation();
