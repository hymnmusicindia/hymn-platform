async function main() {
  const arg = (key: string) => { const index = process.argv.indexOf(key); return index < 0 ? "" : process.argv[index + 1] || ""; };
  if (arg("--env-file")) process.loadEnvFile(arg("--env-file"));
  const { prisma } = await import("../lib/prisma");
  const { configureCrmProgramme } = await import("../lib/team/programme");
  try {
    const workspaceId = arg("--workspace-id"), ownerId = arg("--owner-id"), researcherIds = arg("--researchers").split(",").filter(Boolean), callerId = arg("--caller");
    if (!workspaceId || !ownerId || researcherIds.length !== 3 || !callerId) throw new Error("Supply explicit --workspace-id, --owner-id, --researchers (three IDs) and --caller.");
    const actor = await prisma.teamMember.findFirstOrThrow({ where: { id: ownerId, workspaceId, status: "ACTIVE", role: { owner: true }, user: { status: "ACTIVE" } }, include: { role: true } });
    const staff = await prisma.teamMember.findMany({ where: { id: { in: [...researcherIds, callerId] }, workspaceId, status: "ACTIVE", role: { owner: false } }, select: { id: true, user: { select: { name: true } } } });
    if (staff.length !== 4) throw new Error("Verify all four existing employee memberships before applying.");
    console.log(JSON.stringify({ preview: !process.argv.includes("--apply"), workspaceId, assignments: staff.map(member => ({ id: member.id, name: member.user.name, role: member.id === callerId ? "Call Representative" : "Researcher", dailyTarget: member.id === callerId ? 45 : 15 })) }, null, 2));
    if (!process.argv.includes("--apply")) return;
    const { assertProductionDatabaseReady } = await import("../lib/production-database-safety");
    await assertProductionDatabaseReady();
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${workspaceId} FOR UPDATE`;
      const current = await tx.teamMember.findFirstOrThrow({ where: { id: actor.id, workspaceId, status: "ACTIVE", role: { owner: true }, user: { status: "ACTIVE" } }, include: { role: true } });
      return configureCrmProgramme(tx, current, researcherIds, callerId);
    }, { timeout: 60000, maxWait: 10000 });
    const ownerWork = await prisma.teamTask.count({ where: { workspaceId, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] }, owner: { role: { owner: true } } } });
    console.log(JSON.stringify({ applied: true, ...result, activeOwnerTasks: ownerWork }));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "CRM configuration failed."); process.exitCode = 1; });
