import { NextResponse } from "next/server";
import { z } from "zod";
import { teamActor } from "@/lib/team/access";
import { TeamError } from "@/lib/team/policy";
import { prisma } from "@/lib/prisma";
import { isSameAppOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096).refine(value => value.startsWith("https://")),
  keys: z.object({ p256dh: z.string().min(20).max(512), auth: z.string().min(8).max(256) })
});
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  try {
    const actor = await teamActor();
    const [count] = await Promise.all([
      prisma.teamPushSubscription.count({ where: { memberId: actor.id } })
    ]);
    const publicKey = process.env.TEAM_PUSH_VAPID_PUBLIC_KEY || "";
    return NextResponse.json({ enabled: Boolean(publicKey && process.env.TEAM_PUSH_VAPID_PRIVATE_KEY), publicKey, subscribed: count > 0 }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof TeamError ? error.message : "Push settings unavailable." }, { status: error instanceof TeamError ? error.status : 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameAppOrigin(request)) throw new TeamError("Same-origin request required.", 403);
    const actor = await teamActor();
    const subscription = subscriptionSchema.parse(await request.json());
    await prisma.teamPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: { memberId: actor.id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      update: { memberId: actor.id, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }
    });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const status = error instanceof TeamError ? error.status : error instanceof z.ZodError ? 400 : 503;
    return NextResponse.json({ error: error instanceof TeamError ? error.message : error instanceof z.ZodError ? "Invalid notification subscription." : "Could not save this device for notifications." }, { status, headers });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!isSameAppOrigin(request)) throw new TeamError("Same-origin request required.", 403);
    const actor = await teamActor();
    const { endpoint } = z.object({ endpoint: z.string().url().max(4096) }).parse(await request.json());
    await prisma.teamPushSubscription.deleteMany({ where: { memberId: actor.id, endpoint } });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const status = error instanceof TeamError ? error.status : error instanceof z.ZodError ? 400 : 503;
    return NextResponse.json({ error: error instanceof TeamError ? error.message : "Could not disable notifications for this device." }, { status, headers });
  }
}
