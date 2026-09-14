import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { clientGrowthSchema, GROWTH_COOKIE, GROWTH_COOKIE_SECONDS, growthTouch, hasCampaign, type GrowthTouch } from "@/lib/growth-domain";
import { growthEnabled } from "@/lib/growth";

export async function POST(request: Request) {
  if (!growthEnabled()) return new NextResponse(null, { status: 204 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 8192) return new NextResponse(null, { status: 413 });
  try {
    const raw = await request.text();
    if (raw.length > 8192) return new NextResponse(null, { status: 413 });
    const parsed = clientGrowthSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });
    const rate = await consumeRateLimit({ scope: "growth.events", identity: requestIdentity(request), limit: 180, windowSeconds: 60 });
    if (!rate.allowed) return new NextResponse(null, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const body = parsed.data;
    const touch = growthTouch(body.url, body.referrer);
    if (!["/", "/distribution", "/first-release", "/first-release-free", "/contact", "/partnership-program", "/login"].includes(touch.landing_page)) return new NextResponse(null, { status: 204 });
    const session = await getSession();
    const cookieId = (await cookies()).get(GROWTH_COOKIE)?.value;
    const old = cookieId && /^[a-f0-9-]{36}$/.test(cookieId) ? await prisma.growthVisitor.findUnique({ where: { id: cookieId } }) : null;
    const visitorId = old && (!old.userId || old.userId === session?.sub) ? old.id : randomUUID();
    const visitor = await prisma.growthVisitor.upsert({ where: { id: visitorId }, create: { id: visitorId, userId: session?.sub, firstTouch: touch, lastTouch: touch }, update: { ...(hasCampaign(touch) ? { lastTouch: touch } : {}) } });
    await prisma.growthEvent.createMany({ data: [{ key: `client:${visitor.id}:${body.id}`, event: body.event, source: "client", userId: session?.sub, visitorId: visitor.id, campaign: (visitor.firstTouch as GrowthTouch).utm_campaign, properties: { first_touch: visitor.firstTouch, last_touch: visitor.lastTouch, page: touch.landing_page } }], skipDuplicates: true });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(GROWTH_COOKIE, visitor.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: GROWTH_COOKIE_SECONDS });
    return response;
  } catch { return NextResponse.json({ error: "Tracking temporarily unavailable." }, { status: 503 }); }
}
