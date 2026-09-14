import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GROWTH_COOKIE, type GrowthTouch } from "@/lib/growth-domain";

export function growthEnabled() { return process.env.GROWTH_ANALYTICS_ENABLED === "true"; }
export async function growthContext(userId?: number) {
  const visitorId = (await cookies()).get(GROWTH_COOKIE)?.value;
  const visitor = visitorId ? await prisma.growthVisitor.findUnique({ where: { id: visitorId } }) : null;
  if (visitor && (!visitor.userId || visitor.userId === userId)) return visitor;
  return userId ? prisma.growthVisitor.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } }) : null;
}

/** Observation failure must never turn a successful business action into a failure. */
export async function recordGrowthEvent(input: { event: string; key: string; userId?: number; properties?: Prisma.InputJsonObject; createdAt?: Date; strict?: boolean }) {
  if (!growthEnabled()) return;
  try {
    const visitor = await growthContext(input.userId);
    const first = input.userId ? await prisma.growthVisitor.findFirst({ where: { userId: input.userId }, orderBy: { createdAt: "asc" } }) : visitor;
    const touch = first?.firstTouch as GrowthTouch | undefined;
    await prisma.growthEvent.createMany({ data: [{
      key: input.key, event: input.event, userId: input.userId, visitorId: visitor?.id, createdAt: input.createdAt,
      source: "server", campaign: touch?.utm_campaign,
      properties: { ...input.properties, first_touch: first?.firstTouch ?? null, last_touch: visitor?.lastTouch ?? null }
    }], skipDuplicates: true });
  } catch (error) { console.warn(JSON.stringify({ scope: "growth", event: input.event, status: "record_failed" })); if (input.strict) throw error; }
}

export async function identifyGrowthUser(userId: number, sessionId: string) {
  if (!growthEnabled()) return;
  try {
    const visitor = await growthContext(userId);
    if (visitor && !visitor.userId) await prisma.growthVisitor.updateMany({ where: { id: visitor.id, userId: null }, data: { userId } });
    await recordGrowthEvent({ event: "login_completed", key: `login:${sessionId}`, userId });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (visitor && user && user.createdAt >= visitor.createdAt) await recordGrowthEvent({ event: "signup_completed", key: `signup:${userId}`, userId });
  } catch { console.warn(JSON.stringify({ scope: "growth", event: "identify", status: "record_failed" })); }
}
