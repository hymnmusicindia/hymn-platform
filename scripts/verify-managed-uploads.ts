import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../lib/prisma";
import { createStudioUpload, verifyStudioUpload, writeStudioChunk, completeStudioUpload, studioUploadStatus, studioChunkSize } from "../lib/studio-uploads";
import { localPrivateStorage } from "../lib/private-storage";
import { savePayoutReport, readPayoutReport } from "../lib/payout/report-storage";
import { saveUploadedFile, resolvePublicUploadPath } from "../lib/storage";
import { normalizeUploadMime } from "../lib/upload-mime";
import fs from "node:fs/promises";

async function main() {
  assert.match(process.env.DATABASE_URL || "", /127\.0\.0\.1/);
  const fixture = await prisma.studioServiceOrder.findFirstOrThrow({ where: { projectTitle: "Integration Song" }, include: { engineerParty: true } });
  const order = await prisma.studioServiceOrder.create({ data: { customerId: fixture.customerId, engineerPartyId: fixture.engineerPartyId, engineerProfileId: fixture.engineerProfileId, serviceListingId: fixture.serviceListingId, serviceType: fixture.serviceType, commissionRate: fixture.commissionRate, engineerShareRate: fixture.engineerShareRate, termsVersion: fixture.termsVersion, termsAcceptedAt: new Date(), projectTitle: "Managed Upload Fixture", basePrice: 2000, finalPrice: 2000, includedRevisions: 2, additionalRevisionPrice: 400, turnaroundDays: 5, status: "AWAITING_SOURCE_FILES", paidAt: new Date(), paymentStatus: "HELD" } });
  const bytes = Buffer.alloc(studioChunkSize + 44 + 17640); bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(44100, 24); bytes.writeUInt32LE(176400, 28); bytes.writeUInt16LE(4, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  const metadata = { orderId: order.publicId, role: "SOURCE", filename: "source.wav", mime: "audio/wav", size: bytes.length };
  await assert.rejects(() => createStudioUpload(fixture.engineerParty.claimedByUserId!, metadata), /role|state/);
  const created = await createStudioUpload(order.customerId, metadata), upload = verifyStudioUpload(created.token, order.customerId);
  assert.throws(() => verifyStudioUpload(created.token, fixture.engineerParty.claimedByUserId!), /permission/);
  await assert.rejects(() => writeStudioChunk(upload, 0, bytes.subarray(0, studioChunkSize), "invalid"), /checksum/);
  for (let index = 0; index < 2; index++) {
    const chunk = bytes.subarray(index * studioChunkSize, (index + 1) * studioChunkSize);
    await writeStudioChunk(upload, index, chunk, createHash("sha256").update(chunk).digest("hex"));
    await writeStudioChunk(upload, index, chunk, createHash("sha256").update(chunk).digest("hex"));
  }
  assert.deepEqual(await studioUploadStatus(upload), [0, 1]);
  const [first, replay] = await Promise.all([completeStudioUpload(upload), completeStudioUpload(upload)]);
  assert.equal(first.id, replay.id);
  assert.equal(await prisma.studioFile.count({ where: { assetId: first.id } }), 1);
  assert.equal((await prisma.studioServiceOrder.findUniqueOrThrow({ where: { id: order.id } })).status, "IN_PROGRESS");
  const read = await localPrivateStorage.createAuthorizedRead({ assetId: first.id, requesterUserId: fixture.engineerParty.claimedByUserId!, isAdmin: false, range: "bytes=0-3" });
  assert.equal(read.bytes.toString(), "RIFF");
  const pending = await createStudioUpload(order.customerId, metadata);
  await prisma.studioServiceOrder.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
  await assert.rejects(() => completeStudioUpload(verifyStudioUpload(pending.token, order.customerId)), /permission|closed/);
  await prisma.studioServiceOrder.update({ where: { id: order.id }, data: { status: "IN_PROGRESS" } });
  const reportBytes = Buffer.from("PK fixture workbook"), checksum = createHash("sha256").update(reportBytes).digest("hex");
  const reportPath = await savePayoutReport(reportBytes, "hymn-fixture.xlsx");
  assert.equal(await savePayoutReport(reportBytes, "hymn-fixture.xlsx"), reportPath);
  assert.deepEqual(await readPayoutReport(reportPath, checksum), reportBytes);
  await assert.rejects(() => readPayoutReport("../../secret", checksum), /path/);
  await assert.rejects(() => readPayoutReport(reportPath, "wrong"), /integrity/);
  assert.equal(normalizeUploadMime("", "source.wav"), "audio/wav");
  assert.equal(normalizeUploadMime("application/x-zip-compressed", "stems.zip"), "application/zip");
  for (const format of ["jpeg", "png", "webp"] as const) {
    const image = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#315470" } }).toFormat(format).toBuffer();
    const extension = format === "jpeg" ? "jpg" : format;
    const url = await saveUploadedFile(new File([new Uint8Array(image)], `image.${extension}`, { type: "" }), "producers/avatars", "image");
    assert.deepEqual(await fs.readFile(resolvePublicUploadPath(url.replace("/api/public-uploads/", ""))), image);
  }
  await assert.rejects(() => saveUploadedFile(new File(["bad image"], "bad.png", { type: "image/png" }), "beats/artwork", "image"), /cannot be read/);
  console.log("Managed upload checks passed: chunk checksum/resume/replay, role and closed-project enforcement, source attachment, ranged reads, immutable payout reports, and public JPG/PNG/WebP validation.");
}
main().finally(() => prisma.$disconnect());
