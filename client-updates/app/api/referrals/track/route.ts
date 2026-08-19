import { NextResponse } from "next/server";
import { findUserByReferralCode } from "@/lib/db";
import { referralTrackSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = referralTrackSchema.parse(await request.json());
    const referrer = await findUserByReferralCode(payload.referralCode);
    if (!referrer) return NextResponse.json({ error: "Referral code not found." }, { status: 404 });

    return NextResponse.json({
      referralCode: referrer.referralCode,
      referrerName: referrer.name,
      friendDiscount: 50,
      message: "Referral benefit is ready for signup."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not track referral.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
