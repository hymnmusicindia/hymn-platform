import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { REFERRED_USER_REWARD_INR, REFERRER_REWARD_INR } from "@/lib/referrals";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { referredById: true, referralPromptCompletedAt: true, createdAt: true } });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const newAccount = Date.now() - user.createdAt.getTime() <= 7 * 86_400_000;
  return NextResponse.json({ showPrompt: newAccount && !user.referredById && !user.referralPromptCompletedAt, referrerReward: REFERRER_REWARD_INR, referredReward: REFERRED_USER_REWARD_INR });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  await prisma.user.update({ where: { id: session.sub }, data: { referralPromptCompletedAt: new Date() } });
  return NextResponse.json({ success: true });
}
