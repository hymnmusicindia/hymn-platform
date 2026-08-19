import { NextResponse } from "next/server";
import { buildReferralLink, REFERRAL_CAMPAIGN_ENDS_AT, REFERRAL_FRIEND_DISCOUNT, REFERRAL_REWARD_AMOUNT } from "@/lib/checkout";
import { findUserById, getReferralActivities, getReferralSocialProofCount } from "@/lib/db";
import { getSession } from "@/lib/session";

function nextMilestone(successfulReferrals: number) {
  if (successfulReferrals < 1) return { referrals: 1, bonus: 100, progress: successfulReferrals / 1 };
  if (successfulReferrals < 5) return { referrals: 5, bonus: 300, progress: successfulReferrals / 5 };
  if (successfulReferrals < 10) return { referrals: 10, bonus: 1000, progress: successfulReferrals / 10 };
  return null;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const user = await findUserById(session.sub);
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const activities = await getReferralActivities(user.id);
  const successfulReferrals = activities.filter((activity) => activity.status === "rewarded").length;
  const totalCreditsEarned = activities.reduce((sum, activity) => sum + Number(activity.earnings ?? 0), 0);
  const origin = new URL(request.url).origin;

  return NextResponse.json({
    referral: {
      referralCode: user.referralCode,
      referralLink: buildReferralLink(user, origin),
      referralCredits: Number(user.referralCredits ?? 0),
      earnPerReferral: REFERRAL_REWARD_AMOUNT,
      friendDiscount: REFERRAL_FRIEND_DISCOUNT,
      totalReferrals: activities.length,
      successfulReferrals,
      totalCreditsEarned,
      nextMilestone: nextMilestone(successfulReferrals),
      campaignEndsAt: REFERRAL_CAMPAIGN_ENDS_AT,
      socialProofCount: await getReferralSocialProofCount(),
      activities
    }
  });
}
