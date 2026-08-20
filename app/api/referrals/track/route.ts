import { NextResponse } from "next/server";
import { findUserByReferralCode } from "@/lib/db";
import { referralTrackSchema } from "@/lib/validation";
import { REFERRAL_ATTRIBUTION_COOKIE, REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS } from "@/lib/referrals";

export async function POST(request: Request) {
  try {
    const payload = referralTrackSchema.parse(await request.json());
    const referrer = await findUserByReferralCode(payload.referralCode);
    if (!referrer) return NextResponse.json({ error: "Referral code not found." }, { status: 404 });
    const response = NextResponse.json({ referralCode: referrer.referralCode, valid: true, message: "Referral saved. Sign up to keep it attached to your account." });
    response.cookies.set(REFERRAL_ATTRIBUTION_COOKIE, referrer.referralCode, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not track referral.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
