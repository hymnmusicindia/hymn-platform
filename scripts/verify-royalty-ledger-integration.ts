import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { importRoyaltyStatementAtomic, resolveUnmatchedRoyaltyRow } from "../lib/royalty-import";
import { reconcileFinancialLedger } from "../lib/financial-reconciliation";

async function asset(ownerUserId: number, suffix: string) { return prisma.storedAsset.create({ data: { ownerUserId, assetType: "private_royalty_statement", storageProvider: "fixture", objectKey: `royalty-fixture/${suffix}`, originalFilename: `${suffix}.csv`, safeFilename: `${suffix}.csv`, mimeType: "text/csv", byteSize: 10, checksum: suffix.padEnd(64, "0").slice(0, 64), accessClassification: "private" } }); }
async function main() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const admin = await prisma.user.create({ data: { googleId: `royalty-admin-${stamp}`, name: "Royalty Admin", email: `royalty-admin-${stamp}@example.test`, role: "ADMIN", status: "ACTIVE" } });
  const artist = await prisma.user.create({ data: { googleId: `royalty-artist-${stamp}`, name: "Royalty Artist", email: `royalty-artist-${stamp}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  const release = await prisma.release.create({ data: { userId: artist.id, title: "Royalty Fixture", artistName: artist.name, genre: "Test", releaseDate: new Date(), releaseType: "single", status: "LIVE", paymentStatus: "paid", upc: `UPC${stamp}`, tracks: { create: { title: "Royalty Track", trackNumber: 1, primaryArtist: artist.name, isrc: `ISRC${stamp}` } } }, include: { tracks: true } });
  const stored = await asset(admin.id, `main-${stamp}`); const checksum = `main-${stamp}`.padEnd(64, "a").slice(0, 64);
  const result = await importRoyaltyStatementAtomic({ provider: "Fixture DSP", currency: "INR", periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"), checksum, originalFileName: "fixture.csv", storedAssetId: stored.id, actorId: admin.id, matched: [
    { releaseId: release.id, trackId: release.tracks[0].id, userId: artist.id, isrc: release.tracks[0].isrc, upc: release.upc, sourceLineNumber: 2, statementMonth: new Date("2026-01-01"), platform: "Fixture", grossRevenue: "10.123456", serviceFee: "1.000000", netRevenue: "10.123456", originalValues: { line: 2 } },
    { releaseId: release.id, trackId: release.tracks[0].id, userId: artist.id, isrc: release.tracks[0].isrc, upc: release.upc, sourceLineNumber: 3, statementMonth: new Date("2026-01-01"), platform: "Fixture", grossRevenue: "-1.123456", serviceFee: 0, netRevenue: "-1.123456", originalValues: { line: 3, adjustment: true } }
  ], unmatched: [{ sourceKey: `unmatched-${stamp}`, sourceLineNumber: 4, statementMonth: new Date("2026-01-01"), isrc: "UNKNOWN", rawData: { platform: "Fixture", gross_revenue: "5.500000", net_revenue: "5.500000" } }] });
  assert.equal(result.imported, 2); assert.equal(result.unmatched, 1);
  const lines = await prisma.royaltyLineItem.findMany({ where: { statementId: result.statementId }, include: { allocations: true } });
  assert.equal(lines.length, 2); assert(lines.every(line => line.allocations.length === 1));
  assert.equal((await prisma.royaltyAdjustment.count({ where: { statementId: result.statementId } })), 1);
  let balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: artist.id } });
  assert(new Prisma.Decimal(balance.availableBalance).equals("9.000000"));

  const rollbackAsset = await asset(admin.id, `rollback-${stamp}`); const rollbackChecksum = `rollback-${stamp}`.padEnd(64, "b").slice(0, 64);
  await assert.rejects(() => importRoyaltyStatementAtomic({ provider: "Fixture DSP", currency: "INR", periodStart: new Date("2026-02-01"), periodEnd: new Date("2026-02-28"), checksum: rollbackChecksum, originalFileName: "rollback.csv", storedAssetId: rollbackAsset.id, actorId: admin.id, matched: [{ releaseId: release.id, trackId: release.tracks[0].id, userId: artist.id, sourceLineNumber: 2, statementMonth: new Date("2026-02-01"), platform: "Fixture", grossRevenue: 4, serviceFee: 0, netRevenue: 4, originalValues: { rollback: true } }], unmatched: [], failAfterLine: 1 }), /rollback fixture/);
  assert.equal(await prisma.royaltyStatement.count({ where: { fileChecksum: rollbackChecksum } }), 0);
  balance = await prisma.artistPayoutBalance.findUniqueOrThrow({ where: { userId: artist.id } }); assert(new Prisma.Decimal(balance.availableBalance).equals("9.000000"));

  const unmatched = await prisma.unmatchedRoyaltyRow.findUniqueOrThrow({ where: { sourceKey: `unmatched-${stamp}` } });
  await resolveUnmatchedRoyaltyRow({ unmatchedRowId: unmatched.id, releaseId: release.id, trackId: release.tracks[0].id, actorId: admin.id, note: "Manually matched against verified ISRC evidence." });
  const resolved = await prisma.unmatchedRoyaltyRow.findUniqueOrThrow({ where: { id: unmatched.id } }); assert.equal(resolved.status, "matched");
  const recipient = await prisma.user.create({ data: { googleId: `royalty-recipient-${stamp}`, name: "Split Recipient", email: `royalty-recipient-${stamp}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  await prisma.splitRecord.create({ data: { releaseId: release.id, trackId: release.tracks[0].id, ownerUserId: artist.id, status: "active", totalSharePercent: 100, recipients: { create: [
    { releaseId: release.id, trackId: release.tracks[0].id, recipientUserId: artist.id, recipientEmail: artist.email, recipientName: artist.name, role: "owner", sharePercent: 60, payoutEligible: true, inviteMethod: "registered_email", inviteStatus: "accepted" },
    { releaseId: release.id, trackId: release.tracks[0].id, recipientUserId: recipient.id, recipientEmail: recipient.email, recipientName: recipient.name, role: "collaborator", sharePercent: 40, payoutEligible: true, inviteMethod: "registered_email", inviteStatus: "accepted" }
  ] } } });
  const concurrentChecksum = `concurrent-${stamp}`.padEnd(64, "c").slice(0, 64); const concurrentAssetA = await asset(admin.id, `concurrent-a-${stamp}`); const concurrentAssetB = await asset(admin.id, `concurrent-b-${stamp}`);
  const concurrentInput = (storedAssetId: number) => ({ provider: "Fixture DSP", currency: "INR", periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-03-31"), checksum: concurrentChecksum, originalFileName: "concurrent.csv", storedAssetId, actorId: admin.id, matched: [{ releaseId: release.id, trackId: release.tracks[0].id, userId: artist.id, sourceLineNumber: 2, statementMonth: new Date("2026-03-01"), platform: "Fixture", grossRevenue: 10, serviceFee: 0, netRevenue: 10, originalValues: { concurrent: true } }], unmatched: [] });
  const concurrent = await Promise.allSettled([importRoyaltyStatementAtomic(concurrentInput(concurrentAssetA.id)), importRoyaltyStatementAtomic(concurrentInput(concurrentAssetB.id))]);
  assert.equal(concurrent.filter(row => row.status === "fulfilled").length, 1); assert.equal(concurrent.filter(row => row.status === "rejected").length, 1);
  const concurrentStatement = await prisma.royaltyStatement.findUniqueOrThrow({ where: { fileChecksum: concurrentChecksum } });
  const splitAllocations = await prisma.royaltyAllocation.findMany({ where: { lineItem: { statementId: concurrentStatement.id } }, orderBy: { allocatedAmount: "asc" } });
  assert.deepEqual(splitAllocations.map(row => row.allocatedAmount.toFixed(6)), ["4.000000", "6.000000"]);
  assert.equal(await prisma.walletTransaction.count({ where: { referenceType: "royalty_allocation", referenceId: { in: splitAllocations.map(row => String(row.id)) } } }), 2);
  const reconciliation = await reconcileFinancialLedger();
  assert(!reconciliation.issues.some(issue => issue.entityId === String(result.statementId) && issue.severity === "blocking"), JSON.stringify(reconciliation.issues));
  console.log("Royalty atomic import, adjustment, manual match, and reconciliation verification passed.");
}
main().finally(() => prisma.$disconnect());
// vercel trigger 9
