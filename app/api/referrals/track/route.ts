import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { referralTrackSchema } from "@/lib/validation";
import { normalizeReferralCode, REFERRAL_ATTRIBUTION_COOKIE, REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS } from "@/lib/referrals";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { PARTNER_COOKIE } from "@/lib/growth-partners";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const allowedOrigins = new Set([new URL(request.url).origin, getPublicAppUrl(request.url)]);
  if (origin && !allowedOrigins.has(origin)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const rate = await consumeRateLimit({ scope: "referral.track", identity: requestIdentity(request), limit: 30, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Please wait before trying again." }, { status: 429 });
  try {
    const payload = referralTrackSchema.parse(await request.json());
    const code = normalizeReferralCode(payload.referralCode);
    if (!code) return NextResponse.json({ error: "Referral code not found." }, { status: 404 });
    const referrer = await prisma.user.findFirst({ where: { referralCode: { equals: code, mode: "insensitive" }, status: "ACTIVE" }, select: { referralCode: true } });
    if (!referrer?.referralCode) return NextResponse.json({ error: "Referral code not found." }, { status: 404 });
    const response = NextResponse.json({ referralCode: referrer.referralCode, valid: true, message: "Referral saved. Sign up to keep it attached to your account." });
    response.cookies.delete(PARTNER_COOKIE);
    response.cookies.set(REFERRAL_ATTRIBUTION_COOKIE, referrer.referralCode, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not track referral.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
