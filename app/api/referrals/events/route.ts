import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

const schema = z.object({ event: z.enum(["referral_link_copied", "referral_link_shared"]) });
export async function POST(request: Request) {
  const session = await getSession(); if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rate = await consumeRateLimit({ scope: "referral.events", identity: `${session.sub}:${requestIdentity(request)}`, limit: 60, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many events." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  await prisma.auditLog.create({ data: { actorType: "user", actorId: session.sub, actorRole: session.role, action: parsed.data.event.toUpperCase(), entity: "referral_program", entityId: String(session.sub), metadata: { containsPii: false } } });
  return NextResponse.json({ recorded: true });
}
