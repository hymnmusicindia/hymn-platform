import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { localPrivateStorage } from "../lib/private-storage";
import { generateBeatLicense } from "../lib/beat-license";

async function main() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { googleId: `storage-buyer-${stamp}`, name: "Storage Buyer", email: `storage-${stamp}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  const producer = await prisma.user.create({ data: { googleId: `storage-producer-${stamp}`, name: "Storage Producer", email: `producer-${stamp}@example.test`, role: "PRODUCER", status: "ACTIVE" } });
  const beat = await prisma.beat.create({ data: { userId: producer.id, title: "Private Master", bpm: 120, genre: "Test", mood: "Test", keySignature: "C", priceCents: 1000, enabled: true, status: "APPROVED" } });
  const purchase = await prisma.beatPurchase.create({ data: { userId: user.id, beatId: beat.id, licenseType: "mp3", paymentId: `pay_${stamp}` } });

  const [first, second] = await Promise.all([generateBeatLicense(purchase.id, user.id), generateBeatLicense(purchase.id, user.id)]);
  assert.equal(first.licenseUrl, second.licenseUrl);
  assert.match(first.licenseUrl, /^\/api\/assets\/\d+\/download$/);
  const assets = await prisma.storedAsset.findMany({ where: { beatPurchaseId: purchase.id } });
  assert.equal(assets.length, 1, "Concurrent licence generation must create exactly one private asset.");
  const read = await localPrivateStorage.createAuthorizedRead({ assetId: assets[0].id, requesterUserId: user.id, isAdmin: false });
  assert.equal(read.bytes.subarray(0, 4).toString(), "%PDF");
  await assert.rejects(() => localPrivateStorage.createAuthorizedRead({ assetId: assets[0].id, requesterUserId: producer.id, isAdmin: false }), /Forbidden/);
  const notifications = await prisma.notification.count({ where: { eventKey: `beat:${purchase.id}:license_ready` } });
  assert.equal(notifications, 1);
  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);
  const deliverable = await localPrivateStorage.upload({ ownerUserId: producer.id, beatId: beat.id, assetType: "private_beat_deliverable", fileName: "master.wav", mimeType: "audio/wav", bytes: wav });
  assert.equal((await localPrivateStorage.createAuthorizedRead({ assetId: deliverable.id, requesterUserId: user.id, isAdmin: false })).bytes.length, wav.length);
  await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { hasAccess: false } });
  await assert.rejects(() => localPrivateStorage.createAuthorizedRead({ assetId: deliverable.id, requesterUserId: user.id, isAdmin: false }), /Forbidden/);

  console.log("Private storage authorization and idempotency integration verification passed.");
}

main().finally(() => prisma.$disconnect());
// vercel trigger 9
