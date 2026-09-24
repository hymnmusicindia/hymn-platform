-- CreateEnum
CREATE TYPE "StudioOrderStatus" AS ENUM ('DRAFT', 'AWAITING_PAYMENT', 'PAID', 'AWAITING_ENGINEER_ACCEPTANCE', 'ACCEPTED', 'AWAITING_SOURCE_FILES', 'IN_PROGRESS', 'DELIVERED', 'REVISION_PAYMENT_REQUIRED', 'REVISION_REQUESTED', 'CUSTOMER_APPROVED', 'COMPLETED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'DISPUTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StudioPaymentPurpose" AS ENUM ('INITIAL_ORDER', 'ADDITIONAL_REVISION', 'AMENDMENT', 'REFUND');

-- CreateTable
CREATE TABLE "engineer_profiles" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "contributor_party_id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "professional_name" TEXT NOT NULL,
    "profile_photo_url" TEXT,
    "bio" TEXT NOT NULL DEFAULT '',
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portfolio" JSONB,
    "availability" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "max_active_orders" INTEGER NOT NULL DEFAULT 3,
    "verification_state" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "seller_state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payout_state" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "completed_order_count" INTEGER NOT NULL DEFAULT 0,
    "rating_average" DECIMAL(3,2),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "engineer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_service_listings" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "engineer_profile_id" INTEGER NOT NULL,
    "service_type" TEXT NOT NULL DEFAULT 'MIXING_MASTERING',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "standard_price" DECIMAL(12,2) NOT NULL,
    "beat_customer_price" DECIMAL(12,2),
    "included_revisions" INTEGER NOT NULL DEFAULT 2,
    "additional_revision_price" DECIMAL(12,2) NOT NULL,
    "turnaround_days" INTEGER NOT NULL,
    "accepted_genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_requirements" JSONB NOT NULL,
    "deliverables" JSONB NOT NULL,
    "instant_accept" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_service_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_service_orders" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "engineer_party_id" INTEGER NOT NULL,
    "engineer_profile_id" INTEGER NOT NULL,
    "service_listing_id" INTEGER NOT NULL,
    "source_beat_id" INTEGER,
    "source_beat_order_id" INTEGER,
    "source_beat_purchase_id" INTEGER,
    "service_type" TEXT NOT NULL,
    "project_title" TEXT NOT NULL,
    "base_price" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_reason" TEXT,
    "final_price" DECIMAL(12,2) NOT NULL,
    "included_revisions" INTEGER NOT NULL,
    "additional_revision_price" DECIMAL(12,2) NOT NULL,
    "turnaround_days" INTEGER NOT NULL,
    "commission_rate" DECIMAL(5,4) NOT NULL,
    "engineer_share_rate" DECIMAL(5,4) NOT NULL,
    "status" "StudioOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "payment_status" TEXT NOT NULL DEFAULT 'UNPAID',
    "active_revision_count" INTEGER NOT NULL DEFAULT 0,
    "current_delivery_version" INTEGER NOT NULL DEFAULT 0,
    "acceptance_expires_at" TIMESTAMP(3),
    "delivery_due_at" TIMESTAMP(3),
    "auto_complete_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "terms_version" TEXT NOT NULL,
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_order_status_events" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "previous_status" "StudioOrderStatus",
    "new_status" "StudioOrderStatus" NOT NULL,
    "actor_user_id" INTEGER,
    "actor_type" TEXT NOT NULL,
    "reason" TEXT,
    "correlation_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_order_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_messages" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "sender_user_id" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'USER',
    "body" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_files" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "uploader_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_deliveries" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DELIVERED',
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_delivery_files" (
    "delivery_id" INTEGER NOT NULL,
    "studio_file_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MASTER',

    CONSTRAINT "studio_delivery_files_pkey" PRIMARY KEY ("delivery_id","studio_file_id")
);

-- CreateTable
CREATE TABLE "studio_revisions" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "delivery_id" INTEGER NOT NULL,
    "requested_by_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL,
    "payment_required" BOOLEAN NOT NULL DEFAULT false,
    "payment_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "studio_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_amendments" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "proposed_by_id" INTEGER NOT NULL,
    "public_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "payment_id" INTEGER,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_payments" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "purpose" "StudioPaymentPurpose" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "razorpay_order_id" TEXT NOT NULL,
    "razorpay_payment_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_earnings" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "engineer_party_id" INTEGER NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "commission_amount" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_reviews" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_release_handoffs" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "release_id" INTEGER NOT NULL,
    "beat_purchase_id" INTEGER,
    "beat_id" INTEGER,
    "final_studio_file_id" INTEGER NOT NULL,
    "rights_mapping" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_release_handoffs_pkey" PRIMARY KEY ("id")
);

-- Domain invariants that Prisma cannot express in the schema.
ALTER TABLE "engineer_profiles" ADD CONSTRAINT "engineer_profiles_capacity_check" CHECK ("max_active_orders" > 0);
ALTER TABLE "studio_service_listings" ADD CONSTRAINT "studio_listing_prices_check" CHECK ("standard_price" >= 0 AND ("beat_customer_price" IS NULL OR ("beat_customer_price" >= 0 AND "beat_customer_price" <= "standard_price")) AND "additional_revision_price" >= 0);
ALTER TABLE "studio_service_listings" ADD CONSTRAINT "studio_listing_terms_check" CHECK ("included_revisions" >= 0 AND "turnaround_days" > 0);
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_order_prices_check" CHECK ("base_price" >= 0 AND "discount_amount" >= 0 AND "final_price" = "base_price" - "discount_amount" AND "additional_revision_price" >= 0);
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_order_rates_check" CHECK ("commission_rate" >= 0 AND "commission_rate" <= 1 AND "engineer_share_rate" >= 0 AND "engineer_share_rate" <= 1 AND "commission_rate" + "engineer_share_rate" = 1);
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_order_counters_check" CHECK ("included_revisions" >= 0 AND "active_revision_count" >= 0 AND "current_delivery_version" >= 0 AND "turnaround_days" > 0);
ALTER TABLE "studio_revisions" ADD CONSTRAINT "studio_revision_sequence_check" CHECK ("sequence" > 0);
ALTER TABLE "studio_payments" ADD CONSTRAINT "studio_payment_amount_check" CHECK ("amount" >= 0);
ALTER TABLE "studio_earnings" ADD CONSTRAINT "studio_earning_amounts_check" CHECK ("gross_amount" >= 0 AND "commission_amount" >= 0 AND "net_amount" >= 0 AND "gross_amount" = "commission_amount" + "net_amount");
ALTER TABLE "studio_reviews" ADD CONSTRAINT "studio_review_rating_check" CHECK ("rating" BETWEEN 1 AND 5);

-- CreateIndex
CREATE INDEX "studio_service_orders_status_delivery_due_at_idx" ON "studio_service_orders"("status", "delivery_due_at");

-- CreateIndex
CREATE INDEX "studio_service_orders_service_listing_id_status_idx" ON "studio_service_orders"("service_listing_id", "status");

-- CreateIndex
CREATE INDEX "studio_service_orders_source_beat_order_id_idx" ON "studio_service_orders"("source_beat_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_order_status_events_order_id_correlation_id_key" ON "studio_order_status_events"("order_id", "correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "engineer_profiles_public_id_key" ON "engineer_profiles"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "engineer_profiles_contributor_party_id_key" ON "engineer_profiles"("contributor_party_id");

-- CreateIndex
CREATE UNIQUE INDEX "engineer_profiles_slug_key" ON "engineer_profiles"("slug");

-- CreateIndex
CREATE INDEX "engineer_profiles_seller_state_availability_idx" ON "engineer_profiles"("seller_state", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "studio_service_listings_public_id_key" ON "studio_service_listings"("public_id");

-- CreateIndex
CREATE INDEX "studio_service_listings_service_type_active_paused_sort_ord_idx" ON "studio_service_listings"("service_type", "active", "paused", "sort_order");

-- CreateIndex
CREATE INDEX "studio_service_listings_engineer_profile_id_active_idx" ON "studio_service_listings"("engineer_profile_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "studio_service_orders_public_id_key" ON "studio_service_orders"("public_id");

-- CreateIndex
CREATE INDEX "studio_service_orders_customer_id_status_updated_at_idx" ON "studio_service_orders"("customer_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "studio_service_orders_engineer_profile_id_status_updated_at_idx" ON "studio_service_orders"("engineer_profile_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "studio_service_orders_source_beat_purchase_id_idx" ON "studio_service_orders"("source_beat_purchase_id");

-- CreateIndex
CREATE INDEX "studio_order_status_events_order_id_created_at_idx" ON "studio_order_status_events"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "studio_messages_idempotency_key_key" ON "studio_messages"("idempotency_key");

-- CreateIndex
CREATE INDEX "studio_messages_order_id_created_at_idx" ON "studio_messages"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "studio_files_asset_id_key" ON "studio_files"("asset_id");

-- CreateIndex
CREATE INDEX "studio_files_order_id_category_created_at_idx" ON "studio_files"("order_id", "category", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "studio_files_order_id_category_version_key" ON "studio_files"("order_id", "category", "version");

-- CreateIndex
CREATE INDEX "studio_deliveries_order_id_delivered_at_idx" ON "studio_deliveries"("order_id", "delivered_at");

-- CreateIndex
CREATE UNIQUE INDEX "studio_deliveries_order_id_version_key" ON "studio_deliveries"("order_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "studio_revisions_delivery_id_key" ON "studio_revisions"("delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_revisions_payment_id_key" ON "studio_revisions"("payment_id");

-- CreateIndex
CREATE INDEX "studio_revisions_order_id_status_idx" ON "studio_revisions"("order_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_revisions_order_id_sequence_key" ON "studio_revisions"("order_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "studio_amendments_public_id_key" ON "studio_amendments"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_amendments_payment_id_key" ON "studio_amendments"("payment_id");

-- CreateIndex
CREATE INDEX "studio_amendments_order_id_status_idx" ON "studio_amendments"("order_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_payments_razorpay_order_id_key" ON "studio_payments"("razorpay_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_payments_razorpay_payment_id_key" ON "studio_payments"("razorpay_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_payments_idempotency_key_key" ON "studio_payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "studio_payments_order_id_purpose_status_idx" ON "studio_payments"("order_id", "purpose", "status");

-- CreateIndex
CREATE UNIQUE INDEX "studio_earnings_order_id_key" ON "studio_earnings"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_earnings_idempotency_key_key" ON "studio_earnings"("idempotency_key");

-- CreateIndex
CREATE INDEX "studio_earnings_engineer_party_id_created_at_idx" ON "studio_earnings"("engineer_party_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "studio_reviews_order_id_key" ON "studio_reviews"("order_id");

-- CreateIndex
CREATE INDEX "studio_reviews_customer_id_created_at_idx" ON "studio_reviews"("customer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "studio_release_handoffs_order_id_key" ON "studio_release_handoffs"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "studio_release_handoffs_release_id_key" ON "studio_release_handoffs"("release_id");

-- CreateIndex
CREATE INDEX "studio_release_handoffs_beat_purchase_id_idx" ON "studio_release_handoffs"("beat_purchase_id");

-- AddForeignKey
ALTER TABLE "engineer_profiles" ADD CONSTRAINT "engineer_profiles_contributor_party_id_fkey" FOREIGN KEY ("contributor_party_id") REFERENCES "contributor_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_service_listings" ADD CONSTRAINT "studio_service_listings_engineer_profile_id_fkey" FOREIGN KEY ("engineer_profile_id") REFERENCES "engineer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_service_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_service_orders_engineer_party_id_fkey" FOREIGN KEY ("engineer_party_id") REFERENCES "contributor_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_service_orders_engineer_profile_id_fkey" FOREIGN KEY ("engineer_profile_id") REFERENCES "engineer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_service_orders_service_listing_id_fkey" FOREIGN KEY ("service_listing_id") REFERENCES "studio_service_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_service_orders_source_beat_id_fkey" FOREIGN KEY ("source_beat_id") REFERENCES "beats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_service_orders_source_beat_order_id_fkey" FOREIGN KEY ("source_beat_order_id") REFERENCES "checkout_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_service_orders" ADD CONSTRAINT "studio_service_orders_source_beat_purchase_id_fkey" FOREIGN KEY ("source_beat_purchase_id") REFERENCES "beat_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_order_status_events" ADD CONSTRAINT "studio_order_status_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_order_status_events" ADD CONSTRAINT "studio_order_status_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_messages" ADD CONSTRAINT "studio_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_files" ADD CONSTRAINT "studio_files_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_files" ADD CONSTRAINT "studio_files_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "stored_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_files" ADD CONSTRAINT "studio_files_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_deliveries" ADD CONSTRAINT "studio_deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_delivery_files" ADD CONSTRAINT "studio_delivery_files_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "studio_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_delivery_files" ADD CONSTRAINT "studio_delivery_files_studio_file_id_fkey" FOREIGN KEY ("studio_file_id") REFERENCES "studio_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_revisions" ADD CONSTRAINT "studio_revisions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_revisions" ADD CONSTRAINT "studio_revisions_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "studio_deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_revisions" ADD CONSTRAINT "studio_revisions_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_revisions" ADD CONSTRAINT "studio_revisions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "studio_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_amendments" ADD CONSTRAINT "studio_amendments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_amendments" ADD CONSTRAINT "studio_amendments_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_amendments" ADD CONSTRAINT "studio_amendments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "studio_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_payments" ADD CONSTRAINT "studio_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_earnings" ADD CONSTRAINT "studio_earnings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_earnings" ADD CONSTRAINT "studio_earnings_engineer_party_id_fkey" FOREIGN KEY ("engineer_party_id") REFERENCES "contributor_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_reviews" ADD CONSTRAINT "studio_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_reviews" ADD CONSTRAINT "studio_reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_release_handoffs" ADD CONSTRAINT "studio_release_handoffs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "studio_service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_release_handoffs" ADD CONSTRAINT "studio_release_handoffs_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_release_handoffs" ADD CONSTRAINT "studio_release_handoffs_beat_purchase_id_fkey" FOREIGN KEY ("beat_purchase_id") REFERENCES "beat_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_release_handoffs" ADD CONSTRAINT "studio_release_handoffs_final_studio_file_id_fkey" FOREIGN KEY ("final_studio_file_id") REFERENCES "studio_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_release_handoffs" ADD CONSTRAINT "studio_release_handoffs_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
