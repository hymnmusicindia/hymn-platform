import { prisma } from "../lib/prisma";

const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm=RESET_ALL_PRODUCERS");

async function main() {
  const [producerUsers, profiles] = await Promise.all([
    prisma.user.findMany({ where: { role: "PRODUCER" }, select: { id: true, email: true, _count: { select: { beats: true, producerSales: true } } }, orderBy: { id: "asc" } }),
    prisma.producerProfile.findMany({ select: { id: true, userId: true, displayName: true }, orderBy: { id: "asc" } })
  ]);
  const affectedUserIds = [...new Set([...producerUsers.map((user) => user.id), ...profiles.map((profile) => profile.userId)])];
  const preview = {
    mode: apply ? "apply" : "dry-run",
    producerAccounts: producerUsers.length,
    producerProfiles: profiles.length,
    affectedUserIds,
    beatsToDisable: producerUsers.reduce((total, user) => total + user._count.beats, 0),
    salesPreserved: producerUsers.reduce((total, user) => total + user._count.producerSales, 0),
    contributorIdentitiesPreserved: true,
    userAccountsPreserved: true
  };
  console.log(JSON.stringify(preview, null, 2));
  if (!apply) return;
  if (!confirmed) throw new Error("Refusing reset without --confirm=RESET_ALL_PRODUCERS.");

  const result = await prisma.$transaction(async (tx) => {
    const disabledBeats = affectedUserIds.length
      ? await tx.beat.updateMany({ where: { userId: { in: affectedUserIds } }, data: { enabled: false, status: "HIDDEN" } })
      : { count: 0 };
    const deletedProfiles = await tx.producerProfile.deleteMany({});
    const demotedUsers = await tx.user.updateMany({ where: { role: "PRODUCER" }, data: { role: "CUSTOMER" } });
    await tx.auditLog.create({
      data: {
        action: "PRODUCER_ACCOUNTS_RESET",
        entity: "producer_accounts",
        entityId: "all",
        metadata: { affectedUserIds, disabledBeats: disabledBeats.count, deletedProfiles: deletedProfiles.count, demotedUsers: demotedUsers.count, preservedSales: preview.salesPreserved }
      }
    });
    return { disabledBeats: disabledBeats.count, deletedProfiles: deletedProfiles.count, demotedUsers: demotedUsers.count };
  }, { timeout: 30_000 });
  console.log(JSON.stringify({ resetComplete: true, ...result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
