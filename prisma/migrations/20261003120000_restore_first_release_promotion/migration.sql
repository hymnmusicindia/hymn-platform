-- Restore the campaign configuration in databases whose schema was baselined
-- after the original migration's seed statement had already been skipped.
INSERT INTO "promotions" (
  "code", "name", "product", "discount_type", "discount_value", "active", "updated_at"
)
VALUES (
  'FIRST_RELEASE_FREE', 'First Release Free', 'SINGLE_RELEASE', 'fixed_base_fee', 99.00, true, CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "product" = EXCLUDED."product",
  "discount_type" = EXCLUDED."discount_type",
  "discount_value" = EXCLUDED."discount_value",
  "active" = true,
  "updated_at" = CURRENT_TIMESTAMP;
