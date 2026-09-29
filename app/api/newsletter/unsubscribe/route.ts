import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";

const inputSchema = z.object({ token: z.string().trim().min(20).max(128) });

export async function POST(request: Request) {
  const rate = await consumeRateLimit({ scope: "newsletter-unsubscribe", identity: requestIdentity(request), limit: 8, windowSeconds: 60 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "This unsubscribe request is invalid." }, { status: 400 });
  try {
    await prisma.newsletterSubscriber.updateMany({
      where: { unsubscribeToken: input.data.token, status: "subscribed" },
      data: { status: "unsubscribed", unsubscribedAt: new Date() }
    });
    return NextResponse.json({ unsubscribed: true });
  } catch (error) {
    console.error("Newsletter unsubscribe failed", error);
    return NextResponse.json({ error: "Could not unsubscribe right now. Please try again shortly." }, { status: 503 });
  }
}
