import { prisma } from "@/lib/prisma";

export async function queueGrowthNudges(userId: number, releaseId: number, liveAt: Date) {
  await prisma.growthNudge.createMany({ data: [30, 60, 90].map(stage => ({ key: `next-release:${releaseId}:${stage}`, userId, releaseId, stage, dueAt: new Date(liveAt.getTime() + stage * 86400000) })), skipDuplicates: true });
}
export async function deliverGrowthNudges(deadline: number) {
  const rows = await prisma.growthNudge.findMany({ where: { status: "pending", dueAt: { lte: new Date() } }, orderBy: { dueAt: "asc" }, take: 50 });
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    await prisma.$transaction(async tx => {
      const preference = await tx.growthCommunicationPreference.findUnique({ where: { userId: row.userId } });
      const release = await tx.release.findUnique({ where: { id: row.releaseId } });
      const newer = release ? await tx.release.count({ where: { userId: row.userId, createdAt: { gt: release.createdAt }, archivedAt: null } }) : 1;
      const subscription = row.stage === 90 ? await tx.subscription.findUnique({ where: { userId: row.userId } }) : null;
      const skip = !preference?.reminders || !release || release.archivedAt || newer > 0 || (subscription && subscription.expiryDate > new Date()) || Date.now() - row.dueAt.getTime() > 30 * 86400000;
      const claim = await tx.growthNudge.updateMany({ where: { key: row.key, status: "pending" }, data: { status: skip ? "skipped" : "sent" } });
      if (!claim.count || skip) return;
      await tx.notification.upsert({ where: { eventKey: row.key }, create: { userId: row.userId, eventKey: row.key, title: row.stage === 90 ? "Planning more releases?" : "Ready for your next release?", body: row.stage === 90 ? "Compare HYMN plans for your upcoming music." : "Start your next draft whenever you are ready.", type: "account", href: row.stage === 90 ? "/distribution" : "/distribution/start" }, update: {} });
    });
  }
}
