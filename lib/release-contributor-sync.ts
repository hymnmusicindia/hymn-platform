import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { CanonicalContributionInput } from "@/lib/contributor-identity";
import { normalizeContributorRole, mapContributorRoleToDireNote } from "@/lib/contributor-roles";

export const releaseSaveTransactionOptions = { timeout: 120_000, maxWait: 10_000 };

// Caller owns the release transaction. Resolve identities for the whole release
// together; names alone must never merge different people.
export async function syncReleaseContributions(db: Prisma.TransactionClient, input: {
  actorUserId: number;
  tracks: { trackId: number; contributions: CanonicalContributionInput[] }[];
}) {
  if (!input.tracks.length) return;
  const rows = input.tracks.flatMap(track => track.contributions.map((raw, sequence) => {
    const role = normalizeContributorRole(raw.role);
    if (!role) throw new Error(`Unsupported contributor role: ${raw.role}`);
    const providerRole = mapContributorRoleToDireNote(role);
    const creditedName = String(providerRole === "producer" ? raw.artistName || raw.name || "" : raw.legalName || raw.name || "").trim();
    if (!creditedName) throw new Error(providerRole === "producer" ? "Producer artist name is required." : "Contributor legal name is required.");
    const reference = raw.clientReference?.trim();
    return { raw, trackId: track.trackId, sequence, role, providerRole, creditedName,
      key: raw.partyId ? `party:${raw.partyId}` : reference ? `ref:${input.actorUserId}:${reference}` : `new:${randomBytes(12).toString("hex")}`,
      reference: !raw.partyId && reference ? `${input.actorUserId}:${reference}` : null };
  }));
  const ids = [...new Set(rows.flatMap(row => row.raw.partyId ? [row.raw.partyId] : []))];
  const references = [...new Set(rows.flatMap(row => row.reference ? [row.reference] : []))];
  // Serialize credit creation for this owner across concurrent release saves.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(81422029, ${input.actorUserId}::integer)`;
  const identities = new Map<string, { id: number; publicId: string; professionalName: string }>();
  if (ids.length) {
    const existing = await db.contributorParty.findMany({ where: { id: { in: ids }, mergedIntoId: null }, select: { id: true, publicId: true, professionalName: true } });
    for (const party of existing) identities.set(`party:${party.id}`, party);
    if (existing.length !== ids.length) throw new Error("The selected contributor identity is unavailable.");
  }
  if (references.length) {
    const existing = await db.contributorExternalIdentifier.findMany({ where: { scheme: "HYMN_CREDIT_REF", value: { in: references } }, include: { party: true } });
    for (const identifier of existing) {
      if (identifier.party.mergedIntoId) throw new Error("The selected contributor identity is unavailable.");
      identities.set(`ref:${identifier.value}`, identifier.party);
    }
  }
  const missing = new Map<string, typeof rows[number]>();
  for (const row of rows) if (!identities.has(row.key) && !missing.has(row.key)) missing.set(row.key, row);
  const pending = [...missing].map(([key, row]) => ({ key, row, publicId: `HYM_${randomBytes(12).toString("base64url").toUpperCase()}` }));
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  if (pending.length) {
    await db.contributorParty.createMany({ data: pending.map(({ publicId, row }) => ({ publicId, professionalName: row.creditedName, displayName: row.creditedName, legalName: row.raw.legalName?.trim() || null, createdByUserId: input.actorUserId })) });
    const created = await db.contributorParty.findMany({ where: { publicId: { in: pending.map(row => row.publicId) } }, select: { id: true, publicId: true, professionalName: true } });
    const byPublicId = new Map(created.map(party => [party.publicId, party]));
    for (const item of pending) {
      const party = byPublicId.get(item.publicId);
      if (!party) throw new Error("Could not create a contributor identity.");
      identities.set(item.key, party);
      audits.push({ actorId: input.actorUserId, actorType: "user", actorRole: "release_owner", entity: "contributor_party", entityId: String(party.id), action: "contributor.identity_created", newValue: { publicId: party.publicId, professionalName: party.professionalName }, metadata: { source: "release_credit" } });
    }
    const external = pending.filter(item => item.row.reference).map(item => ({ partyId: identities.get(item.key)!.id, scheme: "HYMN_CREDIT_REF", value: item.row.reference! }));
    if (external.length) await db.contributorExternalIdentifier.createMany({ data: external });
    await db.contributorNameHistory.createMany({ data: pending.map(item => ({ partyId: identities.get(item.key)!.id, professionalName: identities.get(item.key)!.professionalName, displayName: identities.get(item.key)!.professionalName, changedByUserId: input.actorUserId, reason: "Created from release credit" })) });
  }
  const desired = new Map(rows.map(row => {
    const partyId = identities.get(row.key)!.id;
    return [`${row.trackId}:${partyId}:${row.role}`, { trackId: row.trackId, partyId, role: row.role, creditedName: row.creditedName, legalNameSnapshot: row.raw.legalName?.trim() || null, providerRole: row.providerRole, sequence: row.sequence }];
  }));
  const current = await db.trackContribution.findMany({ where: { trackId: { in: input.tracks.map(track => track.trackId) }, source: "RELEASE_FORM" }, select: { id: true, trackId: true, partyId: true, role: true } });
  if (desired.size) {
    // One upsert for all credits. Preserve source/creator on existing credits,
    // and avoid rewriting unchanged rows on retries.
    await db.$executeRaw`
      INSERT INTO track_contributions (track_id,party_id,role,credited_name,legal_name_snapshot,provider_role,sequence,source,created_by_user_id,created_at,updated_at)
      SELECT x."trackId",x."partyId",x.role,x."creditedName",x."legalNameSnapshot",x."providerRole",x.sequence,'RELEASE_FORM',${input.actorUserId},NOW(),NOW()
      FROM jsonb_to_recordset(${JSON.stringify([...desired.values()])}::jsonb) AS x("trackId" int,"partyId" int,role text,"creditedName" text,"legalNameSnapshot" text,"providerRole" text,sequence int)
      ON CONFLICT (track_id,party_id,role) DO UPDATE SET credited_name=EXCLUDED.credited_name,legal_name_snapshot=EXCLUDED.legal_name_snapshot,provider_role=EXCLUDED.provider_role,sequence=EXCLUDED.sequence,updated_at=NOW()
      WHERE (track_contributions.credited_name,track_contributions.legal_name_snapshot,track_contributions.provider_role,track_contributions.sequence)
        IS DISTINCT FROM (EXCLUDED.credited_name,EXCLUDED.legal_name_snapshot,EXCLUDED.provider_role,EXCLUDED.sequence)`;
  }
  const removed = current.filter(row => !desired.has(`${row.trackId}:${row.partyId}:${row.role}`));
  if (removed.length) await db.trackContribution.deleteMany({ where: { id: { in: removed.map(row => row.id) } } });
  for (const track of input.tracks) audits.push({ actorId: input.actorUserId, actorType: "user", actorRole: "release_owner", entity: "track", entityId: String(track.trackId), action: "contributor.credits_synchronized", newValue: { contributions: [...desired.values()].filter(row => row.trackId === track.trackId).map(({ partyId, role, creditedName }) => ({ partyId, role, creditedName })) }, metadata: { removedContributionIds: removed.filter(row => row.trackId === track.trackId).map(row => row.id) } });
  if (audits.length) await db.auditLog.createMany({ data: audits });
}
