import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { localPrivateStorage } from "../lib/private-storage";
import { getBeatLicenceAgreement, generateBeatLicense } from "../lib/beat-license";

async function main() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({ data: { googleId: `storage-buyer-${stamp}`, name: "Storage Buyer", email: `storage-${stamp}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  await prisma.artistCard.create({ data: { userId: user.id, artistName: "Storage Buyer" } });
  const producer = await prisma.user.create({ data: { googleId: `storage-producer-${stamp}`, name: "Storage Producer", email: `producer-${stamp}@example.test`, role: "PRODUCER", status: "ACTIVE" } });
  const beat = await prisma.beat.create({ data: { userId: producer.id, title: "Private Master", bpm: 120, genre: "Test", mood: "Test", keySignature: "C", priceCents: 1000, enabled: true, status: "APPROVED" } });
  const purchase = await prisma.beatPurchase.create({ data: { userId: user.id, beatId: beat.id, licenseType: "mp3", paymentId: `pay_${stamp}` } });

  await assert.rejects(()=>generateBeatLicense(purchase.id,user.id),/Add your artist name/,"A saved artist profile is not purchase consent.");
  const [first, second] = await Promise.all([generateBeatLicense(purchase.id, user.id, false, "Storage Buyer"), generateBeatLicense(purchase.id, user.id, false, "Storage Buyer")]);
  assert.equal(first.licenseUrl, second.licenseUrl);
  assert.match(first.licenseUrl, /^\/api\/assets\/\d+\/download(?:\?filename=[^&]+)?$/);
  const assets = await prisma.storedAsset.findMany({ where: { beatPurchaseId: purchase.id } });
  assert.equal(assets.length, 1, "Concurrent licence generation must create exactly one private asset.");
  const read = await localPrivateStorage.createAuthorizedRead({ assetId: assets[0].id, requesterUserId: user.id, isAdmin: false });
  assert.equal(read.bytes.subarray(0, 4).toString(), "%PDF");
  await assert.rejects(() => localPrivateStorage.createAuthorizedRead({ assetId: assets[0].id, requesterUserId: producer.id, isAdmin: false }), /Forbidden/);
  const notifications = await prisma.notification.count({ where: { eventKey: `beat:${purchase.id}:license_ready` } });
  assert.equal(notifications, 1);
  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);
  const deliverable = await localPrivateStorage.upload({ ownerUserId: producer.id, beatId: beat.id, assetType: "private_beat_deliverable", fileName: "master.wav", mimeType: "audio/wav", bytes: wav });
  await assert.rejects(()=>localPrivateStorage.createAuthorizedRead({assetId:deliverable.id,requesterUserId:user.id,isAdmin:false}),/Forbidden/,"MP3 buyers must not download a WAV through the generic asset endpoint.");
  await prisma.beatPurchase.create({data:{userId:user.id,beatId:beat.id,licenseType:'wav'}});
  assert.equal((await localPrivateStorage.createAuthorizedRead({ assetId: deliverable.id, requesterUserId: user.id, isAdmin: false })).bytes.length, wav.length);
  const before=await getBeatLicenceAgreement(purchase.id,user.id);
  await prisma.beat.update({where:{id:beat.id},data:{title:'Edited title',generalStreamingLimit:7,generalVideoLimit:0}});
  assert.deepEqual((await getBeatLicenceAgreement(purchase.id,user.id)).clauses,before.clauses,'Issued terms remain frozen after catalogue edits');
  assert.equal((await getBeatLicenceAgreement(purchase.id,user.id)).beatTitle,'Private Master');
  const firstRange = await localPrivateStorage.createAuthorizedRead({ assetId: deliverable.id, requesterUserId: user.id, isAdmin: false, range: "bytes=0-3" });
  assert.equal(firstRange.bytes.toString(), "RIFF");
  assert.equal(firstRange.contentRange, `bytes 0-3/${wav.length}`);
  assert.equal(firstRange.contentLength, "4");
  await assert.rejects(() => localPrivateStorage.createAuthorizedRead({ assetId: deliverable.id, requesterUserId: user.id, isAdmin: false, range: `bytes=${wav.length}-` }), /range is unavailable/);
  await prisma.beatPurchase.updateMany({ where: { userId: user.id, beatId: beat.id }, data: { hasAccess: false } });
  await assert.rejects(() => localPrivateStorage.createAuthorizedRead({ assetId: deliverable.id, requesterUserId: user.id, isAdmin: false }), /Forbidden/);
  await assert.rejects(()=>localPrivateStorage.createAuthorizedRead({assetId:assets[0].id,requesterUserId:user.id,isAdmin:false}),/Forbidden/,'Revoked PDF access must also be blocked through generic asset URLs.');

  console.log("Private storage authorization and idempotency integration verification passed.");
}

main().finally(() => prisma.$disconnect());
// vercel trigger 9
