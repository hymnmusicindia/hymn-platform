import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// No real database is used by this regression test.
process.env.DATABASE_URL = "postgresql://test:test@localhost:1/contributor_sync_test";

async function main() {
  const { syncTrackContributions } = await import("../lib/contributor-identity");
  let lookups = 0;
  let creates = 0;
  const writes: any[] = [];
  const deletions: number[] = [];
  const audits: any[] = [];
  let current: any[] = [];
  const db = {
    contributorParty: {
      findFirst: async ({ where }: any) => { lookups++; return where.id === 9 ? { id: 9 } : null; },
      create: async () => { creates++; return { id: 10, publicId: "HYM_TEST", professionalName: "Artist" }; }
    },
    contributorExternalIdentifier: { findUnique: async () => { lookups++; return null; } },
    trackContribution: {
      findMany: async ({ where }: any) => current.filter(row => row.source === where.source),
      upsert: async (args: any) => { writes.push(args); },
      deleteMany: async ({ where }: any) => { deletions.push(...where.id.in); }
    },
    auditLog: { create: async (args: any) => { audits.push(args.data); } }
  };
  const contributions = [
    { partyId: 9, role: "COMPOSER", legalName: "Artist" },
    { partyId: 9, role: "LYRICIST", legalName: "Artist" }
  ];
  const desired = await syncTrackContributions(db, { trackId: 1, actorUserId: 7, contributions });
  assert.equal(lookups, 1, "Resolve one identity once across multiple roles");
  assert.equal(writes.length, 2);
  current = desired.map((row, index) => ({ ...row, id: index + 1, source: "RELEASE_FORM" }));
  writes.length = 0;
  await syncTrackContributions(db, { trackId: 1, actorUserId: 7, contributions });
  assert.equal(writes.length, 0, "Retrying unchanged credits must avoid redundant writes");
  await syncTrackContributions(db, { trackId: 1, actorUserId: 7, contributions: [{ ...contributions[0], legalName: "Updated" }] });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].update.creditedName, "Updated");
  assert.deepEqual(deletions, [2], "Removed form credits must still be deleted");
  current = [{ id: 3, partyId: 99, role: "PRODUCER", source: "BEAT_PURCHASE" }];
  deletions.length = 0;
  await syncTrackContributions(db, { trackId: 1, actorUserId: 7, contributions: [] });
  assert.deepEqual(deletions, [], "Credits from other sources must be preserved");
  await syncTrackContributions(db, { trackId: 1, actorUserId: 7, contributions: contributions.map(({ partyId, ...row }) => ({ ...row, clientReference: "new-person" })) });
  assert.equal(creates, 1, "A new identity shared across roles must be created once");
  assert.equal(audits.filter(row => row.action === "contributor.identity_created").length, 1);
  await assert.rejects(syncTrackContributions(db, { trackId: 1, actorUserId: 7, contributions: [{ partyId: 404, role: "COMPOSER", legalName: "Missing" }] }), /unavailable/);
  await assert.rejects(syncTrackContributions(db, { trackId: 1, actorUserId: 7, contributions: [{ role: "INVALID", name: "Artist" }] }), /Unsupported/);
  const source = readFileSync("lib/distribution-db.ts", "utf8").split("export async function updatePaidDistributionRelease")[1];
  assert.match(source, /timeout: 30_000/, "The atomic paid release save needs an explicit transaction budget");
  console.log("Contributor sync regression checks passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
