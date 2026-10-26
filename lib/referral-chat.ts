import { prisma } from "@/lib/prisma";

export async function referralConversation(referralId: number, userId: number) {
  return prisma.referral.findFirst({
    where: { id: referralId, endedAt:null,status: { not: "REJECTED" }, OR: [{ userId }, { referredUserId: userId }], owner: { status: "ACTIVE" }, referredUser: { status: "ACTIVE" } },
    include: { owner: { select: { id: true, name: true, avatar: true, handle: { select: { tag: true } } } }, referredUser: { select: { id: true, name: true, avatar: true, handle: { select: { tag: true } } } } },
  });
}

export async function sendReferralMessage(referralId: number, userId: number, body: string, clientKey: string) {
  body = body.trim();
  if (!body || body.length > 2000 || clientKey.length > 64) throw new Error("Invalid message.");
  return prisma.$transaction(async tx => {
    // Serialize sends, reads and blocking for this conversation.
    await tx.$queryRaw`SELECT id FROM referrals WHERE id = ${referralId} FOR UPDATE`;
    const referral = await tx.referral.findFirst({ where: { id: referralId, endedAt:null,status: { not: "REJECTED" }, OR: [{ userId }, { referredUserId: userId }], owner: { status: "ACTIVE" }, referredUser: { status: "ACTIVE" } } });
    if (!referral) return null;
    if (referral.ownerBlocked || referral.followerBlocked) throw new Error("This conversation is paused.");
    const message = await tx.referralMessage.upsert({ where: { referralId_senderId_clientKey: { referralId, senderId: userId, clientKey } }, update: {}, create: { referralId, senderId: userId, body, clientKey } });
    const recipient = userId === referral.userId ? referral.referredUserId! : referral.userId;
    await tx.notification.upsert({ where: { eventKey: `referral-chat:${referralId}:${recipient}` }, update: { title: "New referral message", body: "You have a new message in your referral centre.", readAt: null, createdAt: new Date() }, create: { userId: recipient, type: "account", title: "New referral message", body: "You have a new message in your referral centre.", href: `/dashboard?tab=referral&conversation=${referralId}`, eventKey: `referral-chat:${referralId}:${recipient}` } });
    return message;
  });
}
