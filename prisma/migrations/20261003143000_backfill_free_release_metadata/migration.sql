-- Promotion redemptions are the authoritative record for already submitted
-- free releases. Restore the display marker for releases created before the
-- submission flow began retaining it in release metadata.
UPDATE "releases" AS release
SET "metadata" = COALESCE(release."metadata", '{}'::jsonb) || jsonb_build_object(
  'promotionCode', 'FIRST_RELEASE_FREE'
)
FROM "promotion_redemptions" AS redemption
INNER JOIN "promotions" AS promotion ON promotion."id" = redemption."promotion_id"
WHERE redemption."release_id" = release."id"
  AND redemption."status" = 'REDEEMED'
  AND promotion."code" = 'FIRST_RELEASE_FREE';
