CREATE TABLE "playlist_review_listings" (
 "id" SERIAL PRIMARY KEY, "slug" TEXT NOT NULL UNIQUE, "owner_id" INTEGER REFERENCES "users"("id") ON DELETE RESTRICT,
 "name" TEXT NOT NULL, "playlist_url" TEXT NOT NULL, "description" TEXT NOT NULL, "genres" TEXT NOT NULL,
 "fee_minor" INTEGER NOT NULL CHECK (fee_minor BETWEEN 1000 AND 1000000), "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','PAUSED','DECLINED')),
 "is_hymn" BOOLEAN NOT NULL DEFAULT false, "capacity" INTEGER NOT NULL DEFAULT 20 CHECK (capacity BETWEEN 1 AND 100), "moderation_note" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK (NOT is_hymn OR (owner_id IS NULL AND fee_minor = 5000))
);
CREATE INDEX "playlist_review_listings_status_owner_id_idx" ON "playlist_review_listings"("status","owner_id");
CREATE TABLE "playlist_review_requests" (
 "id" SERIAL PRIMARY KEY, "request_key" TEXT NOT NULL UNIQUE, "listing_id" INTEGER NOT NULL REFERENCES "playlist_review_listings"("id") ON DELETE RESTRICT,
 "customer_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT, "track_title" TEXT NOT NULL, "artist_name" TEXT NOT NULL, "track_url" TEXT NOT NULL, "pitch" TEXT NOT NULL,
 "amount_minor" INTEGER NOT NULL CHECK(amount_minor > 0), "terms_version" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'AWAITING_PAYMENT' CHECK(status IN ('AWAITING_PAYMENT','IN_REVIEW','SHORTLISTED','NOT_A_FIT','REFUND_PENDING','REFUNDED','DISPUTED')),
 "razorpay_order_id" TEXT UNIQUE, "razorpay_payment_id" TEXT UNIQUE, "paid_at" TIMESTAMP(3), "due_at" TIMESTAMP(3), "reviewed_at" TIMESTAMP(3), "remark" TEXT, "next_step" TEXT,
 "refund_id" TEXT UNIQUE, "refund_reason" TEXT, "payout_status" TEXT NOT NULL DEFAULT 'NOT_EARNED', "payout_reference" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(status NOT IN ('SHORTLISTED','NOT_A_FIT') OR (reviewed_at IS NOT NULL AND length(trim(remark)) >= 30 AND length(trim(next_step)) >= 10))
);
CREATE INDEX "playlist_review_requests_customer_id_created_at_idx" ON "playlist_review_requests"("customer_id","created_at");
CREATE INDEX "playlist_review_requests_status_due_at_idx" ON "playlist_review_requests"("status","due_at");
CREATE TABLE "playlist_review_mail" (
 "id" SERIAL PRIMARY KEY, "event_key" TEXT NOT NULL UNIQUE, "user_id" INTEGER REFERENCES "users"("id") ON DELETE RESTRICT, "to_email" TEXT NOT NULL,
 "subject" TEXT NOT NULL, "body" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
 "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "playlist_review_mail_status_available_at_idx" ON "playlist_review_mail"("status","available_at");
INSERT INTO playlist_review_listings(slug,name,playlist_url,description,genres,fee_minor,status,is_hymn) VALUES
 ('dusk-till-dawn','Dusk Till Dawn','https://open.spotify.com/playlist/2soKoURWSXnWJ48ygivet8','Listen to the playlist, check the fit, and send your track for a thoughtful HYMN review.','Explore playlist',5000,'APPROVED',true),
 ('fresh-releases','Fresh Releases','https://open.spotify.com/playlist/1Gx9l9GVerLbzL3Wc7HPBK','A review opportunity for your next chapter. Editorial selection remains independent.','Explore playlist',5000,'APPROVED',true),
 ('indie-hits','Indie Hits','https://open.spotify.com/playlist/5XZL9kya8MYerEUJsvzyyR','Introduce your recording to HYMN. Payment buys a review, never a playlist slot.','Explore playlist',5000,'APPROVED',true),
 ('ungatekept-gems','Ungatekept Gems','https://open.spotify.com/playlist/6SMKwPUHU0T7HKiaz4Qcvv','Good music deserves thoughtful ears. Discover the playlist before submitting.','Explore playlist',5000,'APPROVED',true);
