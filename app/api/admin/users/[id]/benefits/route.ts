import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { artistProfileLimitForPlan } from "@/lib/artist-profile-limits";
import { createNotification } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit-log";

const grantSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("subscription"), plan: z.enum(["half_yearly", "yearly", "yearly_plus"]), durationDays: z.coerce.number().int().min(1).max(1095), note: z.string().trim().min(3).max(300) }),
  z.object({ kind: z.literal("checkout_credit"), amount: z.coerce.number().int().min(1).max(1_000_000), note: z.string().trim().min(3).max(300) })
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("users.read");
  if ("error" in admin) return admin.error;
  const userId = Number((await params).id);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, referralCredits: true, subscription: true } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  return NextResponse.json({ benefits: { checkoutCredit: user.referralCredits, subscription: user.subscription } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = grantSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid benefit grant." }, { status: 400 });
  const body = parsed.data;
  const permission = body.kind === "checkout_credit" ? "wallets.adjust" : "users.manage";
  const admin = await requireAdminPermission(permission);
  if ("error" in admin) return admin.error;
  const userId = Number((await params).id);
  if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  const actorId = "sub" in admin ? Number(admin.sub) || null : null;

  try {
    if (body.kind === "checkout_credit") {
      const adjustmentKey = `ADMIN_ADJUSTMENT:${userId}:${Date.now()}`;
      const user = await prisma.$transaction(async tx => {
        const updated = await tx.user.update({ where: { id: userId }, data: { referralCredits: { increment: body.amount } }, select: { id: true, name: true, referralCredits: true } });
        await tx.creditLedgerEntry.create({ data: { userId, type: "ADMIN_ADJUSTMENT", bucket: "HYMN_CREDIT", amount: body.amount, direction: "credit", sourceType: "admin_adjustment", sourceId: adjustmentKey, description: body.note, idempotencyKey: adjustmentKey, balanceAfter: updated.referralCredits, metadata: { actorId } } });
        return updated;
      });
      await Promise.all([
        logAuditEvent({ actorType: "admin", actorId, actorRole: "admin", entityType: "checkout_wallet", entityId: userId, action: "checkout_wallet.credit_granted", newValue: { amountInr: body.amount, balanceInr: user.referralCredits }, reason: body.note, sessionId: "sid" in admin ? String(admin.sid || "") : undefined, riskLevel: "normal" }),
        createNotification({ userId, title: "Checkout credit added", body: `Rs ${body.amount.toLocaleString("en-IN")} was added to your HYMN checkout wallet. You can apply it to a future eligible checkout.`, type: "account", href: "/dashboard", eventKey: `admin-checkout-credit:${userId}:${Date.now()}` })
      ]);
      return NextResponse.json({ benefits: { checkoutCredit: user.referralCredits }, message: `Rs ${body.amount.toLocaleString("en-IN")} added to ${user.name}'s checkout wallet.` });
    }

    const now = new Date();
    const expiryDate = new Date(now.getTime() + body.durationDays * 86_400_000);
    const planName = body.plan === "half_yearly" ? "Half-Yearly" : body.plan === "yearly_plus" ? "Yearly+" : "Yearly";
    const subscription = await prisma.subscription.upsert({
      where: { userId },
      create: { userId, plan: body.plan, planName, expiryDate, status: "active", purchasedAt: now, releasesUsed: 0, releaseLimit: null, artistLimit: artistProfileLimitForPlan(body.plan), availableFeatures: JSON.stringify(["all"]), daysRemaining: body.durationDays, autoRenewal: false },
      update: { plan: body.plan, planName, expiryDate, status: "active", artistLimit: artistProfileLimitForPlan(body.plan), availableFeatures: JSON.stringify(["all"]), daysRemaining: body.durationDays, autoRenewal: false }
    });
    await Promise.all([
      logAuditEvent({ actorType: "admin", actorId, actorRole: "admin", entityType: "subscription", entityId: subscription.id, action: "subscription.admin_granted", newValue: { userId, plan: body.plan, durationDays: body.durationDays, expiryDate }, reason: body.note, sessionId: "sid" in admin ? String(admin.sid || "") : undefined, riskLevel: "normal" }),
      createNotification({ userId, title: `${planName} plan activated`, body: `Your HYMN ${planName} plan is active until ${expiryDate.toLocaleDateString("en-IN")}.`, type: "account", href: "/dashboard", eventKey: `admin-subscription:${userId}:${subscription.updatedAt.toISOString()}` })
    ]);
    return NextResponse.json({ benefits: { subscription }, message: `${planName} granted until ${expiryDate.toLocaleDateString("en-IN")}.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update user benefits." }, { status: 400 });
  }
}
