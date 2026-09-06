import assert from "node:assert/strict";

// All database methods used here are stubbed; never connect to a real database.
process.env.DATABASE_URL = "postgresql://test:test@localhost:1/draft_deletion_test";

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { deleteDraftReleaseForUser } = await import("../lib/distribution-db");
  let row: Record<string, unknown> | null = { id: 42, user_id: 7, status: "DRAFT", created_at: new Date() };
  let writes = 0;
  let affected = 1;
  prisma.$queryRaw = (async () => row ? [row] : []) as any;
  prisma.track.findMany = (async () => []) as any;
  prisma.release.delete = (async () => { throw new Error("Must preserve linked records"); }) as any;
  prisma.release.updateMany = (async (args: any) => {
    writes++;
    assert.equal(args.where.id, 42);
    assert.equal(args.where.status, "DRAFT");
    assert.equal(args.where.archivedAt, null);
    assert.deepEqual(args.where.OR, [
      { ownerUserId: 7 },
      { ownerUserId: null, userId: 7, releaseSource: { not: "ADMIN_MANUAL" } }
    ]);
    assert.equal(args.data.status, "ARCHIVED");
    assert.ok(args.data.archivedAt instanceof Date);
    return { count: affected };
  }) as any;

  assert.equal(await deleteDraftReleaseForUser(7, 42), "deleted");
  affected = 0;
  assert.equal(await deleteDraftReleaseForUser(7, 42), "blocked", "Concurrent submission must prevent deletion");
  row = { ...row, status: "SUBMITTED" };
  assert.equal(await deleteDraftReleaseForUser(7, 42), "blocked");
  row = null;
  assert.equal(await deleteDraftReleaseForUser(7, 42), "not_found");
  assert.equal(writes, 2, "Missing or submitted releases must not be mutated");
  console.log("Draft deletion verification passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
