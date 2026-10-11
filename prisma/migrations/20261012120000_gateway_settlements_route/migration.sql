-- CreateTable
CREATE TABLE "gateway_settlements" (
    "id" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "utr" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_recon_entries" (
    "key" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "paymentId" TEXT,
    "settlementId" TEXT,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "creditMinor" INTEGER NOT NULL,
    "debitMinor" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "settled" BOOLEAN NOT NULL,
    "onHold" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_recon_entries_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "gateway_sync_runs" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "records" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "gateway_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_linked_accounts" (
    "userId" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_linked_accounts_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "route_transfers" (
    "id" SERIAL NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "transferId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "providerStatus" TEXT,
    "onHold" BOOLEAN NOT NULL DEFAULT true,
    "reversedMinor" INTEGER NOT NULL DEFAULT 0,
    "settlementId" TEXT,
    "accountedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gateway_recon_entries_settlementId_idx" ON "gateway_recon_entries"("settlementId");

-- CreateIndex
CREATE INDEX "gateway_recon_entries_paymentId_idx" ON "gateway_recon_entries"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "route_linked_accounts_accountId_key" ON "route_linked_accounts"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "route_transfers_transferId_key" ON "route_transfers"("transferId");

-- CreateIndex
CREATE INDEX "route_transfers_paymentId_idx" ON "route_transfers"("paymentId");

-- CreateIndex
CREATE INDEX "route_transfers_status_idx" ON "route_transfers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "route_transfers_sourceKey_paymentId_key" ON "route_transfers"("sourceKey", "paymentId");

-- AddForeignKey
ALTER TABLE "route_linked_accounts" ADD CONSTRAINT "route_linked_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_transfers" ADD CONSTRAINT "route_transfers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
