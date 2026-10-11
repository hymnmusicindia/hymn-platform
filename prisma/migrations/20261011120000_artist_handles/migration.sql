-- Additive identity tables. Retired handles stay reserved to their original account.
CREATE TABLE "user_handles" (
  "user_id" INTEGER NOT NULL,
  "tag" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_handles_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_handles_format" CHECK (tag ~ '^@[a-z0-9][a-z0-9_.]{2,23}#[0-9]{4}$')
);
CREATE UNIQUE INDEX "user_handles_tag_key" ON "user_handles"("tag");
CREATE TABLE "user_handle_reservations" (
  "tag" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_handle_reservations_pkey" PRIMARY KEY ("tag")
);
CREATE INDEX "user_handle_reservations_user_id_idx" ON "user_handle_reservations"("user_id");
ALTER TABLE "user_handles" ADD CONSTRAINT "user_handles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_handle_reservations" ADD CONSTRAINT "user_handle_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
