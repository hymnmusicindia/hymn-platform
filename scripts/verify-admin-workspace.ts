import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { changeAdministrator } from "../lib/admin-membership-service";
import { adminModuleAllowed, adminNavigation, adminWorkspaceNavigation } from "../lib/admin-workspace-navigation";
import { isAdminAuthority } from "../lib/admin-role-policy";
import { loadAdminSection } from "../lib/admin-read-retry";
import { contentIdLiveTrackCountsQuery, contentIdReviewReadiness, type ContentIdLiveTrackCount } from "../lib/content-id-review-eligibility";
async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55461/team_fixture")) throw Error("Isolated fixture required");
  const recovered = await loadAdminSection("test section", async () => { throw new Error("simulated section failure"); }, [], () => {});
  assert.deepEqual(recovered.value, [], "A failed admin data section should use its explicit fallback.");
  assert.equal(recovered.failure, "test section", "The page must be able to surface failed sections.");
  const loaded = await loadAdminSection("test section", async () => ["ready"], [], () => {});
  assert.deepEqual(loaded, { value: ["ready"], failure: null });
  assert.equal(adminModuleAllowed("unknown-module", ["system.manage"]), false);
  assert.equal(adminModuleAllowed("overview", []), false);
  assert.equal(isAdminAuthority("delegated_system"), false);
  assert.ok(adminNavigation(["releases.review"]).every(n => ["overview", "releases", "content-id-requests"].includes(n.key)));
  const { ALL_ADMIN_PERMISSIONS } = await import("../lib/access");
  for (const n of adminWorkspaceNavigation) assert.equal(adminModuleAllowed(n.key, ALL_ADMIN_PERMISSIONS), true, `Unmapped navigation: ${n.key}`);
  const system = await prisma.adminPermission.upsert({ where: { key: "system.manage" }, create: { key: "system.manage" }, update: {} });
  const makeRole = async (key: string, allowSystem = false) => { const role = await prisma.adminRole.upsert({ where: { key }, create: { key, name: key }, update: {} }); if (allowSystem) await prisma.adminRolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: system.id } }, create: { roleId: role.id, permissionId: system.id }, update: {} }); return role; };
  const superRole = await makeRole("super_admin", true), delegatedRole = await makeRole("delegated_system", true); await makeRole("qc_reviewer");
  const makeUser = (name: string, role: "ADMIN" | "CUSTOMER" = "ADMIN") => prisma.user.create({ data: { name, email: `${name}@example.test`, googleId: name, role } });
  const owner = await makeUser("admin-policy-owner"), delegate = await makeUser("admin-policy-delegate"), target = await makeUser("admin-policy-target", "CUSTOMER");
  const createRelease = (title: string, status: "LIVE" | "PARTIALLY_LIVE" | "DRAFT", trackStatuses: Array<string | null>, archivedAt?: Date) => prisma.release.create({
    data: {
      userId: target.id,
      title,
      artistName: "Eligibility test",
      genre: "Pop",
      releaseDate: new Date(),
      status,
      archivedAt,
      tracks: { create: trackStatuses.map((distributorStatus, index) => ({ title: `${title} ${index + 1}`, trackNumber: index + 1, distributorStatus })) }
    }
  });
  await createRelease("Eligibility live release", "LIVE", [null, null, null]);
  await createRelease("Eligibility partial release", "PARTIALLY_LIVE", ["live"]);
  const getLiveTrackCount = async () => {
    const query = contentIdLiveTrackCountsQuery([target.id]);
    assert.ok(query);
    const rows = await prisma.$queryRaw<ContentIdLiveTrackCount[]>(query);
    return rows[0]?.liveTrackCount ?? 0;
  };
  assert.equal(await getLiveTrackCount(), 4, "Live tracks accumulate across separate releases.");
  assert.equal(contentIdReviewReadiness(await getLiveTrackCount()).ready, false, "Review must stay blocked below five live tracks.");
  await createRelease("Eligibility fifth track", "PARTIALLY_LIVE", ["released"]);
  await createRelease("Eligibility draft", "DRAFT", ["live", "live", "live"]);
  await createRelease("Eligibility archived", "LIVE", ["live"], new Date());
  assert.equal(await getLiveTrackCount(), 5, "Draft and archived tracks do not count toward review eligibility.");
  assert.equal(contentIdReviewReadiness(await getLiveTrackCount()).ready, true, "Review starts at exactly five confirmed live tracks.");
  await prisma.adminMembership.create({ data: { userId: owner.id, roleId: superRole.id } }); await prisma.adminMembership.create({ data: { userId: delegate.id, roleId: delegatedRole.id } });
  await assert.rejects(() => changeAdministrator(delegate.id, target.id, { role: "super_admin", active: true, reason: "Attempted delegated escalation" }), /authority/);
  assert.equal(await prisma.adminMembership.count({ where: { userId: target.id } }), 0);
  await changeAdministrator(owner.id, target.id, { role: "qc_reviewer", active: true, reason: "Quality review responsibility" });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role, "ADMIN");
  assert.equal(await prisma.auditLog.count({ where: { actorId: owner.id, action: "admin.membership.changed" } }), 1);
  await prisma.user.update({ where: { id: target.id }, data: { status: "SUSPENDED" } });
  await changeAdministrator(owner.id, target.id, { role: "qc_reviewer", active: false, reason: "Revoke suspended staff access" });
  assert.equal((await prisma.adminMembership.findUniqueOrThrow({ where: { userId: target.id } })).active, false);
  await prisma.user.update({ where: { id: target.id }, data: { status: "ACTIVE" } });
  await assert.rejects(() => changeAdministrator(owner.id, owner.id, { role: "qc_reviewer", reason: "Self demotion" }), /own access/);
  await prisma.user.update({ where: { id: delegate.id }, data: { status: "SUSPENDED" } });
  await assert.rejects(() => changeAdministrator(delegate.id, target.id, { role: "super_admin", reason: "Suspended authority" }), /authority/);
  await changeAdministrator(owner.id, target.id, { nextRole: "producer", reason: "Return to creator workspace" });
  assert.equal((await prisma.adminMembership.findUniqueOrThrow({ where: { userId: target.id } })).active, false);
  assert.equal((await prisma.producerProfile.findUniqueOrThrow({ where: { userId: target.id } })).active, true);
  console.log("PASS: deny-by-default navigation, explicit power boundaries, anti-escalation, active-account checks, atomic audited role assignment, self-change prevention and producer restoration.");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
