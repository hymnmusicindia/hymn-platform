CREATE UNIQUE INDEX "payout_requests_one_active_per_user_idx" ON "payout_requests"("user_id") WHERE "status" IN ('REQUESTED','UNDER_REVIEW','APPROVED','PROCESSING');
