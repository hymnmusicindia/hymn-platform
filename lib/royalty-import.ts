import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type MatchedRoyaltyImportRow = {
  releaseId: number; trackId?: number | null; userId: number; isrc?: string | null; upc?: string | null;
  sourceLineNumber: number; statementMonth: Date; platform: string; territory?: string | null;
  salesMonth?: Date | null; salesType?: string | null; quantity?: number;
  grossRevenue: Prisma.Decimal.Value; serviceFee: Prisma.Decimal.Value; netRevenue: Prisma.Decimal.Value;
  streams?: number | null; downloads?: number | null; originalValues: Prisma.InputJsonValue;
  sourceKey?: string;
};
export type UnmatchedRoyaltyImportRow = { sourceKey: string; sourceLineNumber: number; statementMonth?: Date | null; isrc?: string | null; upc?: string | null; rawData: Prisma.InputJsonValue };

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const six = (value: Prisma.Decimal) => value.toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);

async function allocateLine(tx: Prisma.TransactionClient, input: { lineId: number; row: MatchedRoyaltyImportRow; currency: string; sourceKey: string }) {
  const net = decimal(input.row.netRevenue);
  const split = net.isNegative() ? null : await tx.splitRecord.findFirst({ where: { releaseId: input.row.releaseId, trackId: input.row.trackId ?? null, status: { in: ["active", "pending_acceptance", "locked"] }, OR: [{ effectiveFromYear: null }, { effectiveFromYear: { lt: input.row.statementMonth.getUTCFullYear() } }, { effectiveFromYear: input.row.statementMonth.getUTCFullYear(), effectiveFromMonth: { lte: input.row.statementMonth.getUTCMonth() + 1 } }] }, include: { recipients: true }, orderBy: { createdAt: "desc" } });
  const recipients = split?.recipients.filter(row => row.payoutEligible && !["declined", "revoked"].includes(row.inviteStatus)) ?? [];
  if (split) {
    const total = recipients.reduce((sum, row) => sum.add(row.sharePercent), new Prisma.Decimal(0));
    if (!total.equals(100)) throw new Error(`Split record ${split.id} must total exactly 100%.`);
  }
  const targets = split ? recipients : [{ id: 0, recipientUserId: input.row.userId, inviteStatus: "accepted", sharePercent: new Prisma.Decimal(100), recipientName: "Release owner" }];
  let allocated = new Prisma.Decimal(0);
  for (const [index, target] of targets.entries()) {
    const amount = index === targets.length - 1 ? net.sub(allocated) : six(net.mul(target.sharePercent).div(100));
    allocated = allocated.add(amount);
    const userId = target.recipientUserId ?? input.row.userId;
    const held = Boolean(split && (target.inviteStatus !== "accepted" || !target.recipientUserId));
    const allocation = await tx.royaltyAllocation.create({ data: { royaltyLineItemId: input.lineId, userId, grossAmount: amount, commissionAmount: 0, allocatedAmount: held ? 0 : amount, heldAmount: held ? amount : 0, currency: input.currency, idempotencyKey: `${input.sourceKey}:allocation:${target.id}` } });
    if (split) await tx.splitEarningLineItem.create({ data: { royaltyLineItemId: input.lineId, splitRecordId: split.id, recipientUserId: target.recipientUserId, recipientEmail: "recipientEmail" in target ? target.recipientEmail : null, recipientName: target.recipientName, recipientRole: "role" in target ? target.role : "owner", releaseId: input.row.releaseId, trackId: input.row.trackId ?? null, sharePercent: target.sharePercent, grossShareAmount: amount, netShareAmount: amount, currency: input.currency, status: held ? "held" : "available" } });
    const balance = await tx.artistPayoutBalance.upsert({ where: { userId }, create: { userId, availableBalance: held ? 0 : amount, pendingBalance: held ? amount : 0, lifetimeEarnings: amount, currency: input.currency }, update: { ...(held ? { pendingBalance: { increment: amount } } : { availableBalance: { increment: amount } }), lifetimeEarnings: { increment: amount }, lastUpdatedAt: new Date() } });
    await tx.walletTransaction.create({ data: { userId, type: amount.isNegative() ? "royalty_adjustment" : "royalty_credit", amount, currency: input.currency, direction: amount.isNegative() ? "debit" : "credit", referenceType: "royalty_allocation", referenceId: String(allocation.id), idempotencyKey: `${input.sourceKey}:wallet:${target.id}`, balanceAfter: held ? balance.pendingBalance : balance.availableBalance, availabilityStatus: held ? "held" : "available", auditMetadata: { royaltyLineItemId: input.lineId, splitRecordId: split?.id ?? null } } });
  }
  if (!allocated.equals(net)) throw new Error(`Royalty line ${input.lineId} was not fully allocated.`);
  if (split) await tx.splitRecord.update({ where: { id: split.id }, data: { status: "locked", lockedAt: split.lockedAt ?? new Date() } });
}

export async function importRoyaltyStatementAtomic(input: { provider: string; currency: string; periodStart: Date; periodEnd: Date; checksum: string; originalFileName: string; storedAssetId?: number; actorId: number; matched: MatchedRoyaltyImportRow[]; unmatched: UnmatchedRoyaltyImportRow[]; failAfterLine?: number }) {
  const keyForMatched = (row: MatchedRoyaltyImportRow) => row.sourceKey ?? `royalty:${input.checksum}:${row.sourceLineNumber}`;
  const incomingKeys = [...input.matched.map(keyForMatched), ...input.unmatched.map(row => row.sourceKey)];
  const existing = new Set<string>();
  if (incomingKeys.length) {
    const [lines, unmatched] = await Promise.all([
      prisma.royaltyLineItem.findMany({ where: { sourceKey: { in: incomingKeys } }, select: { sourceKey: true } }),
      prisma.unmatchedRoyaltyRow.findMany({ where: { sourceKey: { in: incomingKeys } }, select: { sourceKey: true } })
    ]);
    for (const row of [...lines, ...unmatched]) if (row.sourceKey) existing.add(row.sourceKey);
  }
  const matched = input.matched.filter(row => !existing.has(keyForMatched(row)));
  const unmatched = input.unmatched.filter(row => !existing.has(row.sourceKey));
  const ignoredCount = input.matched.length + input.unmatched.length - matched.length - unmatched.length;
  return prisma.$transaction(async tx => {
    const statement = await tx.royaltyStatement.create({ data: { provider: input.provider, currency: input.currency, periodStart: input.periodStart, periodEnd: input.periodEnd, fileChecksum: input.checksum, originalFileName: input.originalFileName, storedAssetId: input.storedAssetId, importedByUserId: input.actorId, status: "importing" } });
    const job = await tx.royaltyImportJob.create({ data: { statementId: statement.id, actorUserId: input.actorId, idempotencyKey: `royalty-import:${input.checksum}`, state: "processing", phase: "generating_ledgers", progress: 75, rowCount: input.matched.length + input.unmatched.length, matchedCount: matched.length, unmatchedCount: unmatched.length, ignoredCount, totalRevenue: matched.reduce((sum, row) => sum.add(row.netRevenue), new Prisma.Decimal(0)) } });
    for (const row of unmatched) await tx.unmatchedRoyaltyRow.create({ data: { sourceKey: row.sourceKey, statementId: statement.id, sourceLineNumber: row.sourceLineNumber, importReference: input.originalFileName, statementMonth: row.statementMonth, upc: row.upc, isrc: row.isrc, rawData: row.rawData } });
    for (const [index, row] of matched.entries()) {
      const sourceKey = keyForMatched(row);
      const line = await tx.royaltyLineItem.create({ data: { userId: row.userId, releaseId: row.releaseId, trackId: row.trackId, upc: row.upc, isrc: row.isrc, platform: row.platform, territory: row.territory, grossRevenue: row.grossRevenue, hymnServiceFee: row.serviceFee, netRevenue: row.netRevenue, streams: row.streams, downloads: row.downloads, quantity: row.quantity ?? row.streams ?? row.downloads ?? 0, salesMonth: row.salesMonth, salesType: row.salesType, statementMonth: row.statementMonth, sourceKey, statementId: statement.id, sourceLineNumber: row.sourceLineNumber, originalValues: row.originalValues, rawMetadata: { enteredVia: "statement_import" } } });
      await allocateLine(tx, { lineId: line.id, row, currency: input.currency, sourceKey });
      if (decimal(row.netRevenue).isNegative()) await tx.royaltyAdjustment.create({ data: { statementId: statement.id, royaltyLineItemId: line.id, amount: row.netRevenue, currency: input.currency, reason: "Negative statement adjustment", idempotencyKey: `${sourceKey}:adjustment`, createdByUserId: input.actorId } });
      if (input.failAfterLine === index + 1) throw new Error("Injected royalty import rollback fixture.");
    }
    await tx.royaltyStatement.update({ where: { id: statement.id }, data: { status: "imported", importedAt: new Date() } });
    await tx.royaltyImportJob.update({ where: { id: job.id }, data: { state: "completed", phase: "completed", progress: 100, completedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: input.actorId, action: "ROYALTY_STATEMENT_IMPORTED", entity: "royalty_statement", entityId: String(statement.id), metadata: { checksum: input.checksum, matched: matched.length, unmatched: unmatched.length, ignored: ignoredCount } } });
    return { statementId: statement.id, jobId: job.id, imported: matched.length, unmatched: unmatched.length, duplicatesIgnored: ignoredCount };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resolveUnmatchedRoyaltyRow(input: { unmatchedRowId: number; releaseId: number; trackId?: number | null; actorId: number; note: string }) {
  if (input.note.trim().length < 5) throw new Error("A reconciliation note is required.");
  return prisma.$transaction(async tx => {
    const unmatched = await tx.unmatchedRoyaltyRow.findUnique({ where: { id: input.unmatchedRowId } });
    if (!unmatched || unmatched.status !== "unmatched" || !unmatched.statementId || !unmatched.sourceLineNumber) throw new Error("Open unmatched royalty row not found.");
    const release = await tx.release.findUnique({ where: { id: input.releaseId }, include: { tracks: true } });
    if (!release) throw new Error("Release not found.");
    const track = input.trackId ? release.tracks.find(row => row.id === input.trackId) : null;
    if (input.trackId && !track) throw new Error("Track does not belong to the selected release.");
    const statement = await tx.royaltyStatement.findUniqueOrThrow({ where: { id: unmatched.statementId } });
    const raw = unmatched.rawData as Record<string, unknown>;
    const grossRevenue = Number(raw.gross_revenue ?? 0); const serviceFee = Number(raw.hymn_commission ?? 0); const netRevenue = Number(raw.artist_pool_amount ?? raw.net_revenue ?? 0);
    if (![grossRevenue, serviceFee, netRevenue].every(Number.isFinite)) throw new Error("Unmatched row contains invalid financial amounts.");
    const statementMonth = unmatched.statementMonth ?? new Date(Date.UTC(statement.periodStart.getUTCFullYear(), statement.periodStart.getUTCMonth(), 1));
    const row: MatchedRoyaltyImportRow = { releaseId: release.id, trackId: track?.id ?? null, userId: release.userId, isrc: unmatched.isrc, upc: unmatched.upc, sourceLineNumber: unmatched.sourceLineNumber, statementMonth, platform: String(raw.platform || "Unknown"), territory: String(raw.territory || "") || null, grossRevenue, serviceFee, netRevenue, streams: raw.streams == null ? null : Number(raw.streams), downloads: raw.downloads == null ? null : Number(raw.downloads), originalValues: unmatched.rawData as Prisma.InputJsonValue };
    const sourceKey = `royalty:${statement.fileChecksum}:${unmatched.sourceLineNumber}`;
    const line = await tx.royaltyLineItem.create({ data: { userId: row.userId, releaseId: row.releaseId, trackId: row.trackId, upc: row.upc, isrc: row.isrc, platform: row.platform, territory: row.territory, grossRevenue, hymnServiceFee: serviceFee, netRevenue, streams: row.streams, downloads: row.downloads, statementMonth, sourceKey, statementId: statement.id, sourceLineNumber: row.sourceLineNumber, originalValues: row.originalValues, rawMetadata: { enteredVia: "manual_reconciliation", unmatchedRowId: unmatched.id, resolutionNote: input.note.trim() } } });
    await allocateLine(tx, { lineId: line.id, row, currency: statement.currency, sourceKey });
    if (decimal(netRevenue).isNegative()) await tx.royaltyAdjustment.create({ data: { statementId: statement.id, royaltyLineItemId: line.id, amount: netRevenue, currency: statement.currency, reason: input.note.trim(), idempotencyKey: `${sourceKey}:adjustment`, createdByUserId: input.actorId } });
    await tx.unmatchedRoyaltyRow.update({ where: { id: unmatched.id }, data: { status: "matched", matchedReleaseId: release.id, matchedTrackId: track?.id ?? null, royaltyLineItemId: line.id, resolutionNote: input.note.trim(), resolvedAt: new Date(), resolvedById: input.actorId } });
    if (unmatched.isrc || unmatched.upc) { const mappingIsrc = unmatched.isrc ?? ""; const mappingUpc = unmatched.upc ?? ""; await tx.royaltyManualMapping.upsert({ where: { isrc_upc: { isrc: mappingIsrc, upc: mappingUpc } }, create: { isrc: mappingIsrc, upc: mappingUpc, releaseId: release.id, trackId: track?.id ?? null, createdById: input.actorId }, update: { releaseId: release.id, trackId: track?.id ?? null, createdById: input.actorId } }); }
    await tx.royaltyImportJob.updateMany({ where: { statementId: statement.id, state: "completed" }, data: { matchedCount: { increment: 1 }, unmatchedCount: { decrement: 1 } } });
    await tx.auditLog.create({ data: { actorId: input.actorId, action: "UNMATCHED_ROYALTY_RESOLVED", entity: "unmatched_royalty_row", entityId: String(unmatched.id), metadata: { releaseId: release.id, trackId: track?.id ?? null, royaltyLineItemId: line.id, note: input.note.trim() } } });
    return { unmatchedRowId: unmatched.id, royaltyLineItemId: line.id, releaseId: release.id, trackId: track?.id ?? null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
// vercel trigger 9

// vercel trigger 14
