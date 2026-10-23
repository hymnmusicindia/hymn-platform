ALTER TABLE "support_tickets" ADD COLUMN "details" JSONB NOT NULL DEFAULT '{}';
CREATE TABLE "support_replies" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "ticketId" INTEGER NOT NULL REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "requestKey" TEXT NOT NULL,
 "authorId" INTEGER NOT NULL,
 "kind" TEXT NOT NULL,
 "recipient" TEXT NOT NULL,
 "subject" TEXT NOT NULL,
 "body" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "attempt" INTEGER NOT NULL DEFAULT 0,
 "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "support_replies_requestKey_key" ON "support_replies"("requestKey");
CREATE INDEX "support_replies_status_createdAt_idx" ON "support_replies"("status", "createdAt");
CREATE INDEX "support_replies_ticketId_createdAt_idx" ON "support_replies"("ticketId", "createdAt");
