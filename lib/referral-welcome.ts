import { prisma } from "@/lib/prisma";

export async function referralWelcomeForSignup(userId: number, startedAt: Date) {
  const referral = await prisma.referral.findFirst({
    where: { referredUserId: userId, registeredAt: { gte: startedAt }, owner: { status: "ACTIVE" } },
    select: { owner: { select: { name: true, avatar: true } } }
  });
  return referral ? { name: referral.owner.name, avatar: referral.owner.avatar } : null;
}
