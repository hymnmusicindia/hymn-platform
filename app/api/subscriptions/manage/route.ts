import { NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/lib/access";
import { createOrUpdateSubscription, getSubscriptionByUserId, upgradeSubscription, downgradeSubscription } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import type { DistributionPlan } from "@/lib/types";

export const runtime = "nodejs";

const PLAN_CONFIGS: Record<DistributionPlan, { artistLimit: number; durationDays: number; features: string[] }> = {
  one_time: {
    artistLimit: 5,
    durationDays: 15,
    features: ["single_release", "5_artist_profiles"]
  },
  half_yearly: {
    artistLimit: 5,
    durationDays: 180,
    features: ["unlimited_releases", "5_artist_profiles", "distribution"]
  },
  yearly: {
    artistLimit: 7,
    durationDays: 365,
    features: ["unlimited_releases", "7_artist_profiles", "distribution", "priority_support"]
  },
  yearly_plus: {
    artistLimit: 15,
    durationDays: 365,
    features: ["unlimited_releases", "15_artist_profiles", "custom_label", "distribution", "priority_support"]
  }
};

function isDistributionPlan(value: unknown): value is DistributionPlan {
  return typeof value === "string" && value in PLAN_CONFIGS;
}

function usesPostgresPrisma() {
  return /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL?.trim() ?? "");
}

async function logSubscriptionAction(actorId: number | null, userId: number, action: string, metadata: Record<string, unknown>) {
  if (!usesPostgresPrisma()) return;
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entity: "subscriptions",
      entityId: String(userId),
      metadata: metadata as any
    }
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if ("error" in admin) return admin.error;
  const actorId = "sub" in admin ? admin.sub : null;

  try {
    const body = await request.json();
    const userId = Number(body.userId);
    const action = String(body.action || "");
    const newPlan = body.newPlan;

    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Valid userId is required." }, { status: 400 });
    }
    if (!["assign", "upgrade", "downgrade", "extend", "modify_expiry", "remove"].includes(action)) {
      return NextResponse.json({ error: "Invalid subscription action." }, { status: 400 });
    }

    const current = await getSubscriptionByUserId(userId);
    let subscription: unknown = null;

    if (action === "remove") {
      if (!usesPostgresPrisma()) {
        return NextResponse.json({ error: "Subscription removal requires the database-backed runtime." }, { status: 501 });
      }
      await prisma.subscription.update({
        where: { userId },
        data: { status: "cancelled", daysRemaining: 0, autoRenewal: false, updatedAt: new Date() }
      });
      await logSubscriptionAction(actorId, userId, "SUBSCRIPTION_REMOVED", { previous: current });
      return NextResponse.json({ success: true, subscription: await getSubscriptionByUserId(userId) });
    }

    if (action === "modify_expiry") {
      if (!usesPostgresPrisma()) {
        return NextResponse.json({ error: "Expiry modification requires the database-backed runtime." }, { status: 501 });
      }
      const expiryDate = new Date(String(body.expiryDate || ""));
      if (Number.isNaN(expiryDate.getTime())) {
        return NextResponse.json({ error: "Valid expiryDate is required." }, { status: 400 });
      }
      const daysRemaining = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      subscription = await prisma.subscription.update({
        where: { userId },
        data: {
          expiryDate,
          status: daysRemaining > 0 ? "active" : "expired",
          daysRemaining,
          updatedAt: new Date()
        }
      });
      await logSubscriptionAction(actorId, userId, "SUBSCRIPTION_EXPIRY_MODIFIED", { previous: current, expiryDate: expiryDate.toISOString() });
      return NextResponse.json({ success: true, subscription });
    }

    if (!isDistributionPlan(newPlan)) {
      return NextResponse.json({ error: "Valid newPlan is required." }, { status: 400 });
    }

    const config = PLAN_CONFIGS[newPlan];
    if (action === "assign") {
      subscription = await createOrUpdateSubscription(userId, newPlan, Number(body.durationDays ?? config.durationDays), config.artistLimit, config.features);
    } else if (action === "upgrade") {
      if (!current) {
        subscription = await createOrUpdateSubscription(userId, newPlan, config.durationDays, config.artistLimit, config.features);
      } else {
        subscription = await upgradeSubscription(userId, newPlan, config.artistLimit, Number(body.extendDays ?? config.durationDays));
      }
    } else if (action === "downgrade") {
      if (!current) return NextResponse.json({ error: "No subscription found." }, { status: 404 });
      const expiryDate = new Date(current.expiryDate);
      const remainingDays = Math.max(0, Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      subscription = await downgradeSubscription(userId, newPlan, remainingDays, config.artistLimit);
    } else if (action === "extend") {
      if (!usesPostgresPrisma()) {
        return NextResponse.json({ error: "Subscription extension requires the database-backed runtime." }, { status: 501 });
      }
      const extendDays = Number(body.extendDays ?? config.durationDays);
      if (!Number.isFinite(extendDays) || extendDays <= 0) {
        return NextResponse.json({ error: "extendDays must be positive." }, { status: 400 });
      }
      const existing = await prisma.subscription.findUnique({ where: { userId } });
      if (!existing) return NextResponse.json({ error: "No subscription found." }, { status: 404 });
      const baseTime = Math.max(Date.now(), existing.expiryDate.getTime());
      const expiryDate = new Date(baseTime + extendDays * 24 * 60 * 60 * 1000);
      subscription = await prisma.subscription.update({
        where: { userId },
        data: {
          expiryDate,
          status: "active",
          daysRemaining: Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          updatedAt: new Date()
        }
      });
    }

    await logSubscriptionAction(actorId, userId, `SUBSCRIPTION_${action.toUpperCase()}`, {
      previous: current,
      nextPlan: isDistributionPlan(newPlan) ? newPlan : null,
      subscription
    });

    return NextResponse.json({ success: true, subscription: await getSubscriptionByUserId(userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update subscription.";
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
    const subscription = await getSubscriptionByUserId(userId);

    const history = usesPostgresPrisma()
      ? await prisma.auditLog.findMany({
          where: { entity: "subscriptions", entityId: String(userId) },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      : [];

    return NextResponse.json({ subscription, history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch subscription.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger 2
