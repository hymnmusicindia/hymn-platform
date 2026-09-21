import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CONTRIBUTOR_ROLES, mapContributorRoleToDireNote, normalizeContributorRole } from "../lib/contributor-roles";
import { mapContributorToDireNote } from "../lib/contributor-provider-mapping";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260922160000_canonical_contributor_identity/migration.sql");
const identity = read("lib/contributor-identity.ts");
const startRelease = read("app/api/beat-purchases/[id]/start-release/route.ts");
const distribution = read("lib/distribution-db.ts");

for (const model of ["ContributorParty", "ContributorExternalIdentifier", "ContributorNameHistory", "TrackContribution", "TrackContributionSnapshot", "ContributorInvitation", "ProducerIdentityMerge", "ReleaseTrackBeatLink"]) assert.match(schema, new RegExp(`model ${model}\\b`));
assert.match(schema, /@@unique\(\[trackId, partyId, role\]\)/, "One party/role credit must be idempotent per track.");
assert.match(schema, /claimedByUserId\s+Int\?\s+@unique/, "A user may claim at most one canonical contributor identity.");
assert.match(schema, /publicId\s+String\s+@unique/, "Public contributor IDs must be stable and unique.");
assert.match(migration, /ON CONFLICT \([^)]*\) DO NOTHING/);
assert.doesNotMatch(migration, /\b(DROP|TRUNCATE)\b/i, "Identity migration must be additive.");
assert.match(read("scripts/audit-producer-identity-migration.ts"), /SAFE_LINK/);
assert.match(identity, /HYMN_CREDIT_REF/, "New unclaimed entries must reuse a client reference without name matching.");
assert.doesNotMatch(identity, /find(?:First|Unique)\([^)]*professionalName/s, "Identity reuse must never match solely by name.");
assert.match(identity, /identityState: "MERGED"/);
assert.match(identity, /Both identities are claimed by different accounts/);
assert.match(identity, /Historical credits remain linked|trackContributionSnapshot|snapshots preserved|snapshot/i);
assert.match(startRelease, /releaseTrackBeatLink\.create/);
assert.match(startRelease, /syncTrackContributions/);
assert.match(distribution, /syncTrackContributions/);

for (const role of ["PRODUCER", "CO_PRODUCER", "ADDITIONAL_PRODUCER", "EXECUTIVE_PRODUCER", "VOCAL_PRODUCER", "REMIXER", "COMPOSER", "LYRICIST", "SONGWRITER", "MIX_ENGINEER", "MASTERING_ENGINEER", "RECORDING_ENGINEER", "PERFORMER", "ARRANGER"]) assert.ok(CONTRIBUTOR_ROLES.includes(role as any));
assert.equal(normalizeContributorRole("co-producer"), "CO_PRODUCER");
assert.equal(mapContributorRoleToDireNote("CO_PRODUCER"), "producer");
assert.equal(mapContributorRoleToDireNote("MIX_ENGINEER"), null, "Unsupported provider roles stay internal.");
const mapped = mapContributorToDireNote({ role: "PRODUCER", creditedName: "Studio Alias", legalName: "Private Name", email: "private@example.com", partyId: "HYM_SECRET" } as any);
assert.deepEqual(mapped, { role: "producer", contributor: { name: "Studio Alias", ipi: undefined, iprs_member: "No", instagram_url: undefined, x_url: undefined } });
assert.equal(JSON.stringify(mapped).includes("Private Name"), false);
assert.equal(JSON.stringify(mapped).includes("private@example.com"), false);
assert.equal(JSON.stringify(mapped).includes("HYM_SECRET"), false);

for (const endpoint of ["app/api/contributors/route.ts", "app/api/contributors/claim/route.ts", "app/api/contributors/[id]/invite/route.ts", "app/api/admin/contributors/merge/route.ts"]) assert.match(read(endpoint), /require(?:User|Admin|RecentAdmin)/, `${endpoint} must enforce server authorization.`);
console.log("Producer/contributor lifecycle verification passed: identity, reuse, roles, privacy, Beat linking, snapshots, merge guards, and API authorization.");
