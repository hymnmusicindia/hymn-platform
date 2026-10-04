import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateBeatLicense } from "@/lib/beat-license";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret")?.trim();
  if (!expected || !supplied) return false;
  return crypto.timingSafeEqual(crypto.createHash("sha256").update(expected).digest(), crypto.createHash("sha256").update(supplied).digest());
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const artistName = typeof body.artistName === "string" ? body.artistName.trim() : "";
  if (!email || !artistName) return NextResponse.json({ error: "Email and artistName are required." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const beat = await prisma.beat.findFirst({ where: { enabled: true, status: "PUBLISHED" }, orderBy: { createdAt: "asc" } });
  if (!beat) return NextResponse.json({ error: "No published beat is available for a sample agreement." }, { status: 409 });
  const marker = `sample-agreement:${user.id}:${beat.id}`;
  let purchase = await prisma.beatPurchase.findFirst({ where: { userId: user.id, beatId: beat.id, paymentId: marker } });
  if (!purchase) purchase = await prisma.beatPurchase.create({ data: { userId: user.id, beatId: beat.id, producerPartyId: beat.producerPartyId, licenseType: "mp3", paymentId: marker, hasAccess: true,
    licenseVersion: "sample-2026-10-05", licenseTermsSnapshot: { version: "sample-2026-10-05", sample: true, licenseType: "mp3", beat: { id: beat.id, title: `${beat.title} · Sample agreement` }, buyer: { id: user.id, legalName: user.name, artistName, email: user.email }, purchaseDate: new Date().toISOString(), currency: "INR", price: 0, legalMode: "NON_EXCLUSIVE_LICENSE", rights: { commercialUse: true, maxCommercialReleases: 1, monetizationAllowed: true, creditRequired: true, contentIdPolicy: "NOT_ALLOWED", territory: "Worldwide", includesMp3: true }, restrictions: { samplesSubjectToProducerDisclosure: true, priorGeneralLicensesRemainValid: true } } } });
  const result = await generateBeatLicense(purchase.id, user.id, true, artistName);
  return NextResponse.json({ purchaseId: purchase.id, agreementUrl: result.agreementUrl, pdfUrl: `/api/beat-purchases/${purchase.id}/license` }, { status: 201 });
}
