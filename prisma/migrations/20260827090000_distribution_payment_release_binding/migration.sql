ALTER TABLE "distribution_orders"
ADD COLUMN "release_id" INTEGER;

CREATE UNIQUE INDEX "distribution_orders_release_id_key"
ON "distribution_orders"("release_id");

ALTER TABLE "distribution_orders"
ADD CONSTRAINT "distribution_orders_release_id_fkey"
FOREIGN KEY ("release_id") REFERENCES "releases"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
