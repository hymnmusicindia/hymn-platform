import {agreementIdentity,assertPurchaseIdentity,assertLicenceAsset,verifyAgreementBytes} from "./beat-delivery-identity";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { localPrivateStorage } from "@/lib/private-storage";
import { createNotificationOnce } from "@/lib/notifications";
import { emailAppUrl, sendBeatEmailEvent } from "@/lib/email/email-events";
import { logAuditEvent } from "@/lib/audit-log";
import { beatLicenseLabel, normalizeBeatLicenseType } from "@/lib/beat-store";

import { BEAT_LICENCE_VERSION, beatUsageRights, licenceClauses, type LicenceClause } from './beat-licence-terms';
export { BEAT_LICENCE_VERSION } from './beat-licence-terms';
type JsonRecord = Record<string, unknown>;

export type BeatLicenceAgreement = {
  purchaseId: number; licenceNumber: string; version: string; licenceType: string; licenceLabel: string; exclusive: boolean;
  beatTitle: string; buyerLegalName: string; artistName: string; buyerEmail: string; producerName: string; producerLegalName?: string | null;
  purchasedAt: string; price: string; rights: Array<{ label: string; value: string }>; clauses: Array<{ title: string; body: string }>;
  pdfUrl: string | null; releaseId: number | null; studioOrder: { publicId: string; status: string } | null;
};

function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function stringValue(value: unknown, fallback = "") { return typeof value === "string" && value.trim() ? value.trim() : fallback; }
function yesNo(value: unknown) { return value ? "Allowed" : "Not allowed"; }

function agreementClauses(exclusive: boolean, producerName: string, artistName: string) {
  return [
    { title: "Grant and accepted use", body: exclusive ? `The producer grants ${artistName} the exclusive right to record, reproduce, distribute, publicly perform and monetise new recordings incorporating the beat, subject to this agreement and valid licences issued before this purchase.` : `The producer grants ${artistName} a non-exclusive, non-transferable right to create, distribute, publicly perform and monetise one new recording incorporating the beat within the limits shown in this agreement.` },
    { title: "Ownership", body: exclusive ? `Unless this agreement expressly records a rights assignment, ${producerName} retains copyright in the underlying beat. The buyer owns their original lyrics, vocals and other original additions.` : `${producerName} retains all copyright and ownership in the underlying beat. This licence permits use; it does not sell or assign the beat copyright.` },
    { title: "Credits", body: `Where platform fields and artwork credits permit, the release must credit “Produced by ${producerName}”. The buyer must not claim sole authorship of the underlying beat.` },
    { title: "Restrictions", body: "The beat may not be resold, sublicensed, redistributed as a standalone file, registered as the buyer's original instrumental, or used for unlawful, defamatory or misleading content. Rights in undisclosed or uncleared third-party samples are excluded." },
    { title: "Content identification", body: exclusive ? "Content ID use is permitted only when the rights summary says Allowed and must not interfere with valid earlier licences. HYMN or the producer may request allowlisting evidence." : "The buyer may not register the beat or resulting recording in YouTube Content ID or another automated claiming system without separate written permission." },
    { title: "Breach and termination", body: "A material breach that is not corrected after written notice may terminate this licence. Accrued payment obligations and ownership, credit, restriction and dispute provisions survive termination." },
    { title: "Record of agreement", body: "The versioned terms snapshot stored by HYMN at issue time is the controlling electronic record. Profile edits made later do not change this agreement. The verified purchase record forms part of this licence." },
    { title: "Law and disputes", body: "The parties should first attempt good-faith resolution through HYMN support. This agreement is governed by applicable Indian law, subject to mandatory consumer rights and the jurisdiction recorded in HYMN's platform terms." }
  ];
}

async function sourceForPurchase(purchaseId: number) {
  const purchase = await prisma.beatPurchase.findUnique({ where: { id: purchaseId }, include: {
    licenseAsset: true, checkoutOrderItem: true,
    user: { include: { artistCards: { where: { archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1 } } },
    beat: { include: { producerParty: true, user: { select: { name: true } } } },
    studioOrders: { orderBy: { updatedAt: "desc" }, take: 1, select: { publicId: true, status: true } }
  } });
  if (!purchase) throw new Error("Beat purchase not found.");
  return purchase;
}

function buildSnapshot(purchase: Awaited<ReturnType<typeof sourceForPurchase>>, artistName: string) {
  const licenceType = normalizeBeatLicenseType(purchase.licenseType); const exclusive = licenceType === "exclusive";
  const existing = record(purchase.licenseTermsSnapshot); const producer = record(existing.producer); const buyer = record(existing.buyer); const rights = record(existing.rights);
  const next = { ...existing, version: stringValue(existing.version, BEAT_LICENCE_VERSION), licenseType: licenceType,
    beat: { ...record(existing.beat), id: purchase.beat.id, title: stringValue(record(existing.beat).title, purchase.beat.title) },
    buyer: { ...buyer, id: purchase.user.id, legalName: stringValue(buyer.legalName, purchase.user.name), artistName:stringValue(buyer.artistName,artistName), email: stringValue(buyer.email,purchase.user.email) },
    producer: { ...producer, partyId: producer.partyId ?? purchase.beat.producerParty?.publicId ?? null, creditedName: stringValue(producer.creditedName, purchase.beat.producerParty?.professionalName ?? purchase.beat.user.name), legalName: stringValue(producer.legalName, purchase.beat.producerParty?.legalName ?? "") || null },
    purchaseDate: stringValue(existing.purchaseDate, purchase.purchasedAt.toISOString()), currency: stringValue(existing.currency, "INR"),
    price: existing.price ?? (purchase.checkoutOrderItem ? Number(purchase.checkoutOrderItem.price) : null), legalMode: stringValue(existing.legalMode, exclusive ? "EXCLUSIVE_LICENSE" : "NON_EXCLUSIVE_LICENSE"),
    rights: exclusive ? { commercialUse: true, exclusiveUse: true, copyrightAssigned: existing.legalMode === "RIGHTS_ASSIGNMENT", contentIdPolicy: stringValue(rights.contentIdPolicy, purchase.beat.sampleDeclaration==="NO_UNCONTROLLED_SAMPLES"?"ALLOWED":"NOT_ALLOWED"), includesWav: true, includesStems: true, ...rights } : { ...beatUsageRights(purchase.beat), includesMp3: licenceType === "mp3", includesWav: licenceType === "wav", includesStems: licenceType === "stems", ...rights },
    restrictions: { samplesSubjectToProducerDisclosure: true, priorGeneralLicensesRemainValid: true, ...record(existing.restrictions) }
  };
  return {...next, ...(Array.isArray(existing.clauses) ? {} : {clauses:next.version === BEAT_LICENCE_VERSION ? licenceClauses(exclusive,next.producer.creditedName,next.rights) : agreementClauses(exclusive,next.producer.creditedName,next.buyer.artistName)})};
}

function agreementFrom(purchase: Awaited<ReturnType<typeof sourceForPurchase>>, snapshot: JsonRecord): BeatLicenceAgreement {
  const buyer = record(snapshot.buyer); const producer = record(snapshot.producer); const beat = record(snapshot.beat); const rights = record(snapshot.rights);
  const licenceType = normalizeBeatLicenseType(stringValue(snapshot.licenseType, purchase.licenseType)); const exclusive = licenceType === "exclusive";
  const artistName = stringValue(buyer.artistName, purchase.user.artistCards[0]?.artistName ?? purchase.user.name);
  const producerName = stringValue(producer.creditedName, purchase.beat.producerParty?.professionalName ?? purchase.beat.user.name);
  const files = rights.includesStems ? (rights.includesWav ? "WAV and stem files" : "Stem files") : rights.includesWav ? "WAV/master file" : "MP3 file";
  const rightsRows = exclusive ? [
    { label: "Commercial use", value: yesNo(rights.commercialUse) }, { label: "Exclusive use", value: yesNo(rights.exclusiveUse) },
    { label: "Underlying copyright", value: rights.copyrightAssigned ? "Assigned under recorded terms" : "Retained by producer" },
    { label: "Content ID", value: stringValue(rights.contentIdPolicy, "ALLOWED").replaceAll("_", " ") }, { label: "Files supplied", value: files },
    { label: "Earlier licences", value: `${Number(snapshot.existingGeneralLicenses ?? 0)} remain valid` }
  ] : [
    { label: "Commercial use", value: yesNo(rights.commercialUse) }, { label: "Commercial releases", value: String(rights.maxCommercialReleases ?? 1) },
    { label: "Audio streams", value: rights.streamingLimit == null ? "No numeric cap" : String(rights.streamingLimit) }, { label: "Music videos", value: rights.videoLimit == null ? "No numeric cap" : String(rights.videoLimit) }, { label: "Live performances", value: yesNo(rights.performanceRights) },
    { label: "Monetisation", value: yesNo(rights.monetizationAllowed) }, { label: "Content ID", value: stringValue(rights.contentIdPolicy, "NOT_ALLOWED").replaceAll("_", " ") },
    { label: "Producer credit", value: rights.creditRequired ? "Required" : "Not required" },
    { label: "Territory / term", value: `${stringValue(rights.territory, "Worldwide")} / ${rights.termDurationMonths ? `${rights.termDurationMonths} months` : "No fixed term"}` }, { label: "Files supplied", value: files }
  ];
  const rawPrice = snapshot.price; const price = typeof rawPrice === "number" || typeof rawPrice === "string" ? `${stringValue(snapshot.currency, "INR")} ${Number(rawPrice).toLocaleString("en-IN")}` : "Recorded in verified purchase";
  return { purchaseId: purchase.id, licenceNumber: `HYMN-BL-${String(purchase.id).padStart(7, "0")}`, version: stringValue(snapshot.version, purchase.licenseVersion ?? BEAT_LICENCE_VERSION), licenceType, licenceLabel: beatLicenseLabel(licenceType), exclusive,
    beatTitle: stringValue(beat.title, purchase.beat.title), buyerLegalName: stringValue(buyer.legalName, purchase.user.name), artistName, buyerEmail: stringValue(buyer.email,purchase.user.email),
    producerName, producerLegalName: stringValue(producer.legalName) || null, purchasedAt: stringValue(snapshot.purchaseDate, purchase.purchasedAt.toISOString()), price,
    rights: rightsRows, clauses: Array.isArray(snapshot.clauses) ? snapshot.clauses as LicenceClause[] : agreementClauses(exclusive, producerName, artistName), pdfUrl: purchase.licenseUrl ? `/api/beat-purchases/${purchase.id}/license` : null,
    releaseId: purchase.releaseId, studioOrder: purchase.studioOrders[0] ? { publicId: purchase.studioOrders[0].publicId, status: purchase.studioOrders[0].status } : null };
}

export async function getBeatLicenceAgreement(purchaseId: number, actorId: number, isAdmin = false) {
  const purchase = await sourceForPurchase(purchaseId); if ((!isAdmin && purchase.userId !== actorId) || !purchase.hasAccess) throw new Error("Beat purchase not found.");
  const stored = record(purchase.licenseTermsSnapshot); const snapshot = Object.keys(stored).length ? stored : buildSnapshot(purchase, purchase.user.artistCards[0]?.artistName ?? purchase.user.name);
  return agreementFrom(purchase, snapshot);
}

async function publicLicenceSource(purchaseId: number) {
  if (!Number.isSafeInteger(purchaseId) || purchaseId < 1 || purchaseId > 2147483647) throw new Error("Beat licence not found.");
  const purchase = await sourceForPurchase(purchaseId);
  const snapshot = record(purchase.licenseTermsSnapshot);
  // Publish issued, frozen grants only; never invent terms from a current artist profile.
  if (!purchase.hasAccess || !stringValue(snapshot.version) || !stringValue(record(snapshot.buyer).artistName)) throw new Error("Beat licence not found.");
  assertPurchaseIdentity(purchase);
  return {purchase,snapshot};
}

export async function getPublicBeatLicenceAgreement(purchaseId: number) {
  const {purchase,snapshot} = await publicLicenceSource(purchaseId);
  return {...agreementFrom(purchase,snapshot),pdfUrl:`/api/beat-purchases/${purchaseId}/license`,releaseId:null,studioOrder:null};
}

export async function readPublicBeatLicencePdf(purchaseId: number) {
  const {purchase,snapshot} = await publicLicenceSource(purchaseId);
  if(purchase.licenseAsset && !purchase.licenseAsset.deletedAt) {
    try {
      assertLicenceAsset(purchase,purchase.licenseAsset);
      // Only this purchase-bound agreement is public. Generic asset/audio access stays private.
      const asset=await localPrivateStorage.createAuthorizedRead({assetId:purchase.licenseAsset.id,requesterUserId:purchase.userId,isAdmin:true});
      await verifyAgreementBytes(asset.bytes,purchase);
      return {bytes:asset.bytes,fileName:asset.fileName};
    } catch { /* Re-render legacy or unavailable PDFs from the same frozen grant, without changing it. */ }
  }
  const agreement=agreementFrom(purchase,snapshot);
  return {bytes:await buildAgreementPdf(agreement,agreementIdentity(purchase)),fileName:`${agreement.licenceNumber}.pdf`};
}

function ascii(value: string) { return value.replace(/[^\x20-\x7E]/g, "-"); }
function wrap(value: string, font: PDFFont, size: number, width: number) { const words = ascii(value).split(/\s+/); const lines: string[] = []; let line = ""; for (const word of words) { const next = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(next, size) <= width) line = next; else { if (line) lines.push(line); line = word; } } if (line) lines.push(line); return lines; }

async function buildAgreementPdf(agreement: BeatLicenceAgreement,identity:string) {
  const pdf = await PDFDocument.create();pdf.setSubject(identity);pdf.setTitle(`${agreement.beatTitle} - ${agreement.licenceNumber}`); const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null; try { logo = await pdf.embedPng(await fs.readFile(path.join(process.cwd(), "public", "assets", "hymnlogowhite.png"))); } catch { logo = null; }
  let page: PDFPage = pdf.addPage([595.28, 841.89]); let y = 0; let firstPage = true;
  const newPage = () => { if (!firstPage) page = pdf.addPage([595.28, 841.89]); firstPage = false; page.drawRectangle({ x: 0, y: 742, width: 595.28, height: 100, color: rgb(0.045, 0.055, 0.07) }); if (logo) page.drawImage(logo, { x: 42, y: 778, width: 108, height: 35 }); page.drawText("BEAT LICENCE AGREEMENT", { x: 345, y: 795, size: 9, font: bold, color: rgb(0.78, 0.8, 0.84) }); page.drawText(agreement.licenceNumber, { x: 345, y: 778, size: 8, font: regular, color: rgb(0.64, 0.67, 0.72) }); y = 715; };
  const ensure = (height: number) => { if (y - height < 54) newPage(); };
  const text = (value: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number; indent?: number } = {}) => { const size = options.size ?? 10; const usedFont = options.font ?? regular; const indent = options.indent ?? 0; const lines = wrap(value, usedFont, size, 505 - indent); ensure(lines.length * (size + 4) + (options.gap ?? 8)); for (const line of lines) { page.drawText(line, { x: 45 + indent, y, size, font: usedFont, color: options.color ?? rgb(0.13, 0.14, 0.16) }); y -= size + 4; } y -= options.gap ?? 8; };
  newPage(); text(agreement.licenceLabel, { size: 24, font: bold, gap: 4 }); text(`For "${agreement.beatTitle}"`, { size: 13, color: rgb(0.35, 0.37, 0.42), gap: 18 });
  const details = [["LICENSEE / LEGAL NAME", agreement.buyerLegalName], ["ARTIST NAME", agreement.artistName], ["LICENSOR / PRODUCER", agreement.producerName], ["ISSUED", new Date(agreement.purchasedAt).toLocaleDateString("en-IN")], ["PURCHASE", agreement.price], ["VERSION", agreement.version]];
  for (const [label, value] of details) { ensure(32); page.drawText(label, { x: 45, y, size: 7, font: bold, color: rgb(0.43, 0.45, 0.5) }); page.drawText(ascii(value), { x: 220, y, size: 10, font: bold, color: rgb(0.1, 0.11, 0.13) }); y -= 25; }
  y -= 8; text("RIGHTS SUMMARY", { size: 11, font: bold, gap: 10 }); for (const row of agreement.rights) { ensure(25); page.drawRectangle({ x: 45, y: y - 7, width: 505, height: 24, color: rgb(0.96, 0.965, 0.975) }); page.drawText(ascii(row.label), { x: 55, y, size: 8, font: bold, color: rgb(0.32, 0.34, 0.4) }); page.drawText(ascii(row.value), { x: 250, y, size: 8, font: regular, color: rgb(0.1, 0.11, 0.13) }); y -= 29; }
  y -= 10; text("AGREEMENT TERMS", { size: 11, font: bold, gap: 12 }); agreement.clauses.forEach((clause, index) => { text(`${index + 1}. ${clause.title}`, { size: 10, font: bold, gap: 3 }); text(clause.body, { size: 9, gap: 12, indent: 12 }); });
  ensure(80); y -= 8; page.drawLine({ start: { x: 45, y }, end: { x: 550, y }, thickness: 0.7, color: rgb(0.75, 0.77, 0.8) }); y -= 22; text("Electronically issued by HYMN Music. Keep this document with the related purchase, studio project and release records.", { size: 8, color: rgb(0.4, 0.42, 0.46), gap: 4 }); text(`Verification reference: ${agreement.licenceNumber} | Purchase ${agreement.purchaseId}`, { size: 8, font: bold });
  const pages = pdf.getPages(); pages.forEach((item, index) => item.drawText(`HYMN Music | ${agreement.licenceNumber} | Page ${index + 1} of ${pages.length}`, { x: 45, y: 25, size: 7, font: regular, color: rgb(0.5, 0.52, 0.56) })); return Buffer.from(await pdf.save());
}

export async function generateBeatLicense(purchaseId: number, actorId: number, isAdmin = false, requestedArtistName?: string, options: {sendEmail?:boolean} = {}) {
  if(!Number.isSafeInteger(purchaseId)||purchaseId<1||purchaseId>2147483647)throw new Error('Beat purchase not found.');
  return prisma.$transaction(async tx=>{
    // Serialise issuance across instances so competing artist-name requests
    // cannot leave the saved snapshot different from the winning PDF.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(38419, ${purchaseId}::int)`;
    return generateBeatLicenseLocked(purchaseId,actorId,isAdmin,requestedArtistName,options.sendEmail!==false);
  },{maxWait:5000,timeout:60000});
}

async function generateBeatLicenseLocked(purchaseId: number, actorId: number, isAdmin: boolean, requestedArtistName: string|undefined, sendEmail: boolean) {
  const purchase = await sourceForPurchase(purchaseId); if (!isAdmin && purchase.userId !== actorId) throw new Error("Beat purchase not found."); if (!purchase.hasAccess) throw new Error("Licence access has been revoked.");
  assertPurchaseIdentity(purchase);
  if (purchase.licenseAsset && !purchase.licenseAsset.deletedAt) {
    assertLicenceAsset(purchase,purchase.licenseAsset);
    const stored=await localPrivateStorage.createAuthorizedRead({assetId:purchase.licenseAsset.id,requesterUserId:purchase.userId,isAdmin:true});
    let verified=false;try{await verifyAgreementBytes(stored.bytes,purchase);verified=true;}catch{/* Preserve old bytes and legal terms while rebuilding an unverified PDF. */}
    if(verified){ const existingUrl = `/api/assets/${purchase.licenseAsset.id}/download?filename=${encodeURIComponent(purchase.licenseAsset.safeFilename)}`; if (purchase.licenseUrl !== existingUrl) await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { licenseUrl: existingUrl, licenseUploadedAt: purchase.licenseUploadedAt ?? new Date() } }); return { purchaseId: purchase.id, licenseUrl: existingUrl, agreementUrl: `/licenses/${purchase.id}` }; }
    await prisma.storedAsset.update({where:{id:purchase.licenseAsset.id},data:{beatPurchaseId:null,uploadStatus:"superseded"}});
    await logAuditEvent({actorType:"system",entityType:"beat_purchase",entityId:purchase.id,action:"beat_license.verification_rebuild",metadata:{previousAssetId:purchase.licenseAsset.id,reason:"Rebuild PDF identity binding without changing the legal grant"}});
  }
  if(purchase.licenseAsset?.deletedAt)await prisma.storedAsset.update({where:{id:purchase.licenseAsset.id},data:{beatPurchaseId:null}});
  const artistName = stringValue(record(record(purchase.licenseTermsSnapshot).buyer).artistName) || requestedArtistName?.trim(); if (!artistName || artistName.length < 2 || artistName.length > 80) throw new Error("Add your artist name before generating this licence.");
  if (!purchase.user.artistCards[0] && requestedArtistName?.trim()) await prisma.artistCard.createMany({ data: [{ userId: purchase.userId, artistName, isPrimary: true, role: "primary" }], skipDuplicates: true });
  const snapshot = buildSnapshot(purchase, artistName) as Prisma.InputJsonObject; await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { licenseVersion: stringValue(snapshot.version, BEAT_LICENCE_VERSION), licenseTermsSnapshot: snapshot } });
  const agreement = agreementFrom(purchase, snapshot); const bytes = await buildAgreementPdf(agreement,agreementIdentity({...purchase,licenseTermsSnapshot:snapshot})); let asset;
  try { asset = await localPrivateStorage.upload({ ownerUserId: purchase.userId, beatPurchaseId: purchase.id, assetType: "private_beat_license", fileName: `HYMN-${agreement.licenceNumber}.pdf`, mimeType: "application/pdf", bytes }); }
  catch (error) { const existing = await prisma.storedAsset.findUnique({ where: { beatPurchaseId: purchase.id } }); if (!existing) throw error;assertLicenceAsset(purchase,existing);const existingFile=await localPrivateStorage.createAuthorizedRead({assetId:existing.id,requesterUserId:purchase.userId,isAdmin:false});await verifyAgreementBytes(existingFile.bytes,{...purchase,licenseTermsSnapshot:snapshot}); asset = { id: existing.id, downloadPath: `/api/assets/${existing.id}/download?filename=${encodeURIComponent(existing.safeFilename)}` }; }
  const url = asset.downloadPath; await prisma.beatPurchase.update({ where: { id: purchase.id }, data: { licenseUrl: url, licenseUploadedAt: new Date() } });
  await Promise.all([createNotificationOnce({ eventKey: `beat:${purchase.id}:license_ready`, userId: purchase.userId, title: "Beat licence ready", body: `Your licence for ${purchase.beat.title} is ready to view and download.`, type: "beat", href: `/licenses/${purchase.id}`, actionLabel: "View licence" }), sendEmail && sendBeatEmailEvent({ event: "license_ready", to: purchase.user.email, userId: purchase.userId, purchaseId: purchase.id, userName: purchase.user.name, beatTitle: purchase.beat.title, url: emailAppUrl(`/licenses/${purchase.id}`) }), logAuditEvent({ actorType: isAdmin ? "admin" : "system", actorId, entityType: "beat_purchase", entityId: purchase.id, action: "beat_license.generated", newValue: { licenseUrl: url, agreementUrl: `/licenses/${purchase.id}`, version: BEAT_LICENCE_VERSION }, metadata: { beatId: purchase.beat.id, licenseType: purchase.licenseType, artistName } })]);
  return { purchaseId: purchase.id, licenseUrl: url, agreementUrl: `/licenses/${purchase.id}` };
}
