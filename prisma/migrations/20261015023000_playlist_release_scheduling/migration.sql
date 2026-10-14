ALTER TABLE "playlist_review_requests" DROP CONSTRAINT "playlist_review_requests_status_check";
ALTER TABLE "playlist_review_requests" ADD CONSTRAINT "playlist_review_requests_status_check"
CHECK (status IN ('AWAITING_PAYMENT','WAITING_FOR_RELEASE','WAITING_FOR_LINK','IN_REVIEW','SHORTLISTED','NOT_A_FIT','REFUND_PENDING','REFUNDED','DISPUTED'));
