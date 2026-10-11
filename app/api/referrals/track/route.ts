import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { referralTrackSchema } from "@/lib/validation";
import { REFERRAL_ATTRIBUTION_COOKIE, REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS } from "@/lib/referrals";

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const rate = await consumeRateLimit({ scope: "referral.track", identity: requestIdentity(request), limit: 30, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Please wait before trying again." }, { status: 429 });
  try {
    const payload = referralTrackSchema.parse(await request.json());
    const referrer = await prisma.user.findFirst({ where: { referralCode: { equals: payload.referralCode, mode: "insensitive" }, status: "ACTIVE" }, select: { referralCode: true } });
    if (!referrer?.referralCode) return NextResponse.json({ error: "Referral code not found." }, { status: 404 });
    const response = NextResponse.json({ referralCode: referrer.referralCode, valid: true, message: "Referral saved. Sign up to keep it attached to your account." });
    response.cookies.set(REFERRAL_ATTRIBUTION_COOKIE, referrer.referralCode, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not track referral.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
