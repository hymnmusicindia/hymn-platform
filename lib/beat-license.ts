import { prisma } from "@/lib/prisma";
import { localPrivateStorage } from "@/lib/private-storage";
import { createNotificationOnce } from "@/lib/notifications";
import { emailAppUrl, sendBeatEmailEvent } from "@/lib/email/email-events";
import { logAuditEvent } from "@/lib/audit-log";

function pdfEscape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "?"); }
function buildPdf(lines: string[]) {
  const text = lines.map((line, index) => `BT /F1 ${index === 0 ? 18 : 10} Tf 54 ${760 - index * 24} Td (${pdfEscape(line)}) Tj ET`).join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let output = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output); output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

export async function generateBeatLicense(purchaseId: number, actorId: number, isAdmin = false) {
  const purchase = await prisma.beatPurchase.findUnique({ where: { id: purchaseId }, include: { licenseAsset: true } });
  if (!purchase || (!isAdmin && purchase.userId !== actorId)) throw new Error("Beat purchase not found.");
  const [buyer, beat] = await Promise.all([prisma.user.findUnique({ where: { id: purchase.userId } }), prisma.beat.findUnique({ where: { id: purchase.beatId } })]);
  if (!buyer || !beat) throw new Error("License source data is incomplete.");
  if (purchase.licenseAsset && !purchase.licenseAsset.deletedAt) {
    const existingUrl = `/api/assets/${purchase.licenseAsset.id}/download`;
    if (purchase.licenseUrl !== existingUrl) await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { licenseUrl: existingUrl, licenseUploadedAt: purchase.licenseUploadedAt ?? new Date() } });
    return { purchaseId: purchase.id, licenseUrl: existingUrl };
  }
  const producer = await prisma.user.findUnique({ where: { id: beat.userId } });
  const lines = ["HYMN BEAT LICENSE", `Purchase ID: ${purchase.id}`, `Buyer: ${buyer.name} (${buyer.email})`, `Producer: ${producer?.name ?? `User ${beat.userId}`}`, `Beat: ${beat.title}`, `License type: ${purchase.licenseType}`, `Payment ID: ${purchase.paymentId ?? "Verified checkout"}`, `Issued: ${new Date().toISOString()}`, "Terms: This license grants the buyer usage rights according to the selected HYMN license tier.", "Ownership of the underlying composition remains subject to the producer's listed terms."];
  const bytes = buildPdf(lines);
  let asset;
  try {
    asset = await localPrivateStorage.upload({ ownerUserId: purchase.userId, beatPurchaseId: purchase.id, assetType: "private_beat_license", fileName: `hymn-license-${purchase.id}.pdf`, mimeType: "application/pdf", bytes });
  } catch (error) {
    const existing = await prisma.storedAsset.findUnique({ where: { beatPurchaseId: purchase.id } });
    if (!existing) throw error;
    const existingUrl = `/api/assets/${existing.id}/download`;
    await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { licenseUrl: existingUrl, licenseUploadedAt: purchase.licenseUploadedAt ?? new Date() } });
    return { purchaseId: purchase.id, licenseUrl: existingUrl };
  }
  const url = asset.downloadPath;
  await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { licenseUrl: url, licenseUploadedAt: new Date() } });
  await Promise.all([
    createNotificationOnce({ eventKey: `beat:${purchase.id}:license_ready`, userId: purchase.userId, title: "Beat license ready", body: `Your license for ${beat.title} is ready to download.`, type: "beat", href: `/api/beat-purchases/${purchase.id}/license`, actionLabel: "Download license" }),
    sendBeatEmailEvent({ event: "license_ready", to: buyer.email, userId: purchase.userId, purchaseId: purchase.id, userName: buyer.name, beatTitle: beat.title, url: emailAppUrl(`/api/beat-purchases/${purchase.id}/license`) }),
    logAuditEvent({ actorType: isAdmin ? "admin" : "system", actorId, entityType: "beat_purchase", entityId: purchase.id, action: "beat_license.generated", newValue: { licenseUrl: url }, metadata: { beatId: beat.id, licenseType: purchase.licenseType } })
  ]);
  return { purchaseId: purchase.id, licenseUrl: url };
}
// vercel trigger 6
// vercel trigger 9
