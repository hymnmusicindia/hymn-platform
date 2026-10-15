import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission, requireRecentAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { grantManualSubscription } from "@/lib/admin-subscription-service";
import { isSameAppOrigin } from "@/lib/request-origin";
import { createNotification } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit-log";
import { manageProviderSubscription, subscriptionHasEntitlement } from "@/lib/subscription-billing";

const grantSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("subscription"), plan: z.enum(["half_yearly", "yearly", "yearly_plus"]), durationDays: z.coerce.number().int().min(1).max(1095), note: z.string().trim().min(3).max(300), mode: z.enum(["replace", "extend"]).default("replace"), expectedUpdatedAt: z.string().datetime().nullable() }),
  z.object({ kind: z.literal("checkout_credit"), amount: z.coerce.number().int().min(1).max(1_000_000), note: z.string().trim().min(3).max(300), requestId: z.string().uuid() })
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("users.read");
  if ("error" in admin) return admin.error;
  const userId = Number((await params).id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, referralCredits: true, subscription: true } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  return NextResponse.json({ benefits: { checkoutCredit: user.referralCredits, subscription: user.subscription, active: subscriptionHasEntitlement(user.subscription), subscriptionVersion: user.subscription?.updatedAt.toISOString() ?? null } }, { headers: { "Cache-Control": "private, no-store" } });
}

const revokeSchema = z.object({ note: z.string().trim().min(3).max(300), expectedUpdatedAt: z.string().datetime() });

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const admin = await requireRecentAdminPermission("users.manage");
  if ("error" in admin) return admin.error;
  const userId = Number((await params).id);
  if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  const parsed = revokeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "A removal reason is required." }, { status: 400 });
  const actorId = "sub" in admin ? Number(admin.sub) || null : null;

  try {
    const subscription = await prisma.subscription.findUnique({ where: { userId } });
    if (!subscription || !subscriptionHasEntitlement(subscription)) return NextResponse.json({ error: "This account has no active subscription to remove." }, { status: 409 });
    if (subscription.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt) return NextResponse.json({ error: "The subscription changed. Refresh before removing access." }, { status: 409 });
    if (subscription.razorpaySubscriptionId) await manageProviderSubscription(userId, "cancel_now");
    const revokedAt = new Date();
    if (!subscription.razorpaySubscriptionId) await prisma.$transaction(async tx => {
      const updated = await tx.subscription.updateMany({ where: { id: subscription.id, updatedAt: subscription.updatedAt }, data: { status: "cancelled", expiryDate: revokedAt, currentPeriodEnd: revokedAt, daysRemaining: 0, autoRenewal: false, cancelAtPeriodEnd: false, cancelledAt: revokedAt, nextRenewalDate: null } });
      if (!updated.count) throw Error("Subscription changed during removal. Refresh and retry.");
      await tx.auditLog.create({ data: { actorType: "admin", actorId, actorRole: "admin", entity: "subscription", entityId: String(subscription.id), action: "subscription.admin_revoked", reason: parsed.data.note, riskLevel: "high", previousValue: { plan: subscription.plan, expiryDate: subscription.expiryDate.toISOString() }, newValue: { status: "cancelled", revokedAt: revokedAt.toISOString() } } });
    });
    await Promise.all([
      subscription.razorpaySubscriptionId ? logAuditEvent({ actorType: "admin", actorId, actorRole: "admin", entityType: "subscription", entityId: subscription.id, action: "subscription.admin_revoked", oldValue: { userId, plan: subscription.plan, status: subscription.status, expiryDate: subscription.expiryDate }, newValue: { status: "cancelled", revokedAt }, reason: parsed.data.note, riskLevel: "high" }) : Promise.resolve(),
      createNotification({ userId, title: "Subscription access removed", body: "Your HYMN subscription access has been removed by an administrator. Contact support if you believe this was unexpected.", type: "account", href: "/dashboard", eventKey: `admin-subscription-revoked:${subscription.id}:${revokedAt.toISOString()}` })
    ]);
    return NextResponse.json({ benefits: { subscription: null }, message: "Subscription access removed. Payment and usage history were retained." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove subscription access." }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const parsed = grantSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid benefit grant." }, { status: 400 });
  const body = parsed.data;
  const permission = body.kind === "checkout_credit" ? "wallets.adjust" : "users.manage";
  const admin = await requireRecentAdminPermission(permission);
  if ("error" in admin) return admin.error;
  const userId = Number((await params).id);
  if (!Number.isInteger(userId) || userId <= 0) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  const actorId = "sub" in admin ? Number(admin.sub) || null : null;

  try {
    if (body.kind === "checkout_credit") {
      const adjustmentKey = `ADMIN_ADJUSTMENT:${userId}:${body.requestId}`;
      const user = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(19462028, ${userId}::int)`;
        const existing = await tx.creditLedgerEntry.findUnique({ where: { idempotencyKey: adjustmentKey } });
        if (existing) {
          if (Number(existing.amount) !== body.amount || existing.description !== body.note) throw Error("This request key was used for a different credit adjustment.");
          return { ...await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, referralCredits: true } }), duplicate: true };
        }
        const target = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
        if (target?.status !== "ACTIVE") throw Error("Checkout credits require an active account.");
        const updated = await tx.user.update({ where: { id: userId }, data: { referralCredits: { increment: body.amount } }, select: { id: true, name: true, referralCredits: true } });
        await tx.creditLedgerEntry.create({ data: { userId, type: "ADMIN_ADJUSTMENT", bucket: "HYMN_CREDIT", amount: body.amount, direction: "credit", sourceType: "admin_adjustment", sourceId: adjustmentKey, description: body.note, idempotencyKey: adjustmentKey, balanceAfter: updated.referralCredits, metadata: { actorId } } });
        await tx.auditLog.create({ data: { actorType: "admin", actorId, actorRole: "admin", entity: "checkout_wallet", entityId: String(userId), action: "checkout_wallet.credit_granted", reason: body.note, newValue: { amountInr: body.amount, balanceInr: updated.referralCredits } } });
        return { ...updated, duplicate: false };
      });
      if (!user.duplicate) await createNotification({ userId, title: "Checkout credit added", body: `Rs ${body.amount.toLocaleString("en-IN")} was added to your HYMN checkout wallet. You can apply it to a future eligible checkout.`, type: "account", href: "/dashboard", eventKey: `admin-checkout-credit:${adjustmentKey}` }).catch(() => undefined);
      return NextResponse.json({ benefits: { checkoutCredit: user.referralCredits }, message: `Rs ${body.amount.toLocaleString("en-IN")} added to ${user.name}'s checkout wallet.` });
    }

    const subscription = await grantManualSubscription(userId, actorId, body);
    const { expiryDate, planName } = subscription;
    await createNotification({ userId, title: `${planName} plan activated`, body: `Your HYMN ${planName} plan is active until ${expiryDate.toLocaleDateString("en-IN")}.`, type: "account", href: "/dashboard", eventKey: `admin-subscription:${userId}:${subscription.updatedAt.toISOString()}` }).catch(() => undefined);
    return NextResponse.json({ benefits: { subscription }, message: `${planName} granted until ${expiryDate.toLocaleDateString("en-IN")}.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update user benefits." }, { status: 400 });
  }
}
