import { NextResponse } from "next/server";
import { requireAdminPermission, requireUser } from "@/lib/access";
import { createBeatPurchase, createNotification, getBeatPurchasesByUser, uploadBeatLicense, revokeOrRestoreBeatAccess } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { emailAppUrl, sendBeatEmailEvent } from "@/lib/email/email-events";

export const runtime = "nodejs";

function parseLicenseType(value: unknown) {
  if (value === "mp3" || value === "wav" || value === "stems" || value === "general" || value === "basic" || value === "premium" || value === "exclusive") return value;
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "create") {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Beat purchases must be created through verified checkout." }, { status: 403 });
      }

      const result = await requireUser();
      if ("error" in result) return result.error;

      const beatId = Number(body.beatId);
      const licenseType = parseLicenseType(body.licenseType);
      if (!Number.isInteger(beatId) || beatId <= 0 || !licenseType) {
        return NextResponse.json({ error: "Valid beatId and licenseType are required." }, { status: 400 });
      }

      const purchase = await createBeatPurchase(result.user.id, beatId, licenseType);
      const beat = await prisma.beat.findUnique({ where: { id: beatId }, select: { title: true } });
      if (purchase && beat) await sendBeatEmailEvent({ event: "beat_purchase_success", to: result.user.email, userId: result.user.id, purchaseId: purchase.id, userName: result.user.name, beatTitle: beat.title, url: emailAppUrl("/dashboard?module=purchases") });
      return NextResponse.json({ success: true, purchase }, { status: 201 });
    }

    if (action === "uploadLicense" || action === "toggleAccess") {
      const admin = await requireAdminPermission("users.manage");
      if ("error" in admin) return admin.error;

      const purchaseId = Number(body.purchaseId);
      if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
        return NextResponse.json({ error: "Valid purchaseId is required." }, { status: 400 });
      }

      if (action === "uploadLicense") {
        const licenseUrl = String(body.licenseUrl || "").trim();
        if (!licenseUrl) return NextResponse.json({ error: "licenseUrl is required." }, { status: 400 });
        const purchase = await uploadBeatLicense(purchaseId, licenseUrl);
        if (purchase) {
          await createNotification({
            userId: purchase.userId,
            title: "Beat license ready",
            body: "Your beat license has been uploaded and is ready in your dashboard.",
            type: "beat",
            href: "/dashboard?module=purchases",
            actionLabel: "View license",
            eventKey: `beat:${purchase.id}:license-ready`,
            metadata: { purchaseId: purchase.id, beatId: purchase.beatId, licenseUrl }
          });
          const [buyer, beat] = await Promise.all([prisma.user.findUnique({ where: { id: purchase.userId }, select: { name: true, email: true } }), prisma.beat.findUnique({ where: { id: purchase.beatId }, select: { title: true } })]);
          if (buyer && beat) await sendBeatEmailEvent({ event: "license_ready", to: buyer.email, userId: purchase.userId, purchaseId: purchase.id, userName: buyer.name, beatTitle: beat.title, url: emailAppUrl("/dashboard?module=purchases") });
        }
        return NextResponse.json({ success: true, purchase });
      }

      if (typeof body.hasAccess !== "boolean") {
        return NextResponse.json({ error: "hasAccess must be boolean." }, { status: 400 });
      }
      const purchase = await revokeOrRestoreBeatAccess(purchaseId, body.hasAccess);
      if (purchase) {
        await createNotification({
          userId: purchase.userId,
          title: body.hasAccess ? "Beat access restored" : "Beat access restricted",
          body: body.hasAccess ? "Your beat purchase access has been restored." : "Your beat purchase access was restricted. Contact HYMN support if this looks incorrect.",
          type: "beat",
          href: "/dashboard?module=purchases",
          actionLabel: body.hasAccess ? "Open purchases" : "Contact support",
          priority: body.hasAccess ? "normal" : "high",
          eventKey: `beat:${purchase.id}:access:${body.hasAccess ? "restored" : "restricted"}`,
          metadata: { purchaseId: purchase.id, beatId: purchase.beatId, hasAccess: body.hasAccess }
        });
      }
      return NextResponse.json({ success: true, purchase });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process beat purchase.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId") ? Number(searchParams.get("userId")) : result.user.id;
    const userId = result.user.role === "admin" ? requestedUserId : result.user.id;
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Valid userId is required." }, { status: 400 });
    }

    const purchases = await getBeatPurchasesByUser(userId);
    return NextResponse.json({ purchases });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch beat purchases.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 6
// vercel trigger 9
