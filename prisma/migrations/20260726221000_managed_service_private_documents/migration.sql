CREATE TABLE "managed_service_documents" (
  "request_id" INTEGER NOT NULL,
  "asset_id" INTEGER NOT NULL,
  CONSTRAINT "managed_service_documents_pkey" PRIMARY KEY ("request_id", "asset_id"),
  CONSTRAINT "managed_service_documents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "managed_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "managed_service_documents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "stored_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "managed_service_documents_asset_id_idx" ON "managed_service_documents"("asset_id");
