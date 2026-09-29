import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { newsletterToken, normalizeNewsletterEmail } from "@/lib/newsletter";

const inputSchema = z.object({ email: z.string().trim().email().max(320) });

export async function POST(request: Request) {
  const rate = await consumeRateLimit({ scope: "newsletter-subscribe", identity: requestIdentity(request), limit: 8, windowSeconds: 60 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many subscription attempts. Please try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  try {
    const { email } = input.data;
    const normalized = normalizeNewsletterEmail(email);
    const subscriber = await prisma.newsletterSubscriber.upsert({
      where: { email: normalized },
      create: { email: normalized, unsubscribeToken: newsletterToken(), source: "homepage" },
      update: { status: "subscribed", source: "homepage", consentAt: new Date(), unsubscribedAt: null, unsubscribeToken: newsletterToken() }
    });
    return NextResponse.json({ subscribed: true, status: subscriber.status });
  } catch (error) {
    console.error("Newsletter subscription failed", error);
    return NextResponse.json({ error: "Newsletter signup is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
