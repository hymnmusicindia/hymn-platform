import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";
import { mapContributorRoleToDireNote, normalizeContributorRole, type ContributorRole } from "@/lib/contributor-roles";

type DbClient = typeof prisma;

export type CanonicalContributionInput = {
  partyId?: number;
  clientReference?: string;
  role: string;
  legalName?: string;
  artistName?: string;
  name?: string;
  ipi?: string;
};

function publicPartyId() {
  return `HYM_${randomBytes(12).toString("base64url").toUpperCase()}`;
}

function invitationHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizedEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function createContributorParty(input: {
  createdByUserId: number;
  professionalName: string;
  legalName?: string | null;
  country?: string | null;
  email?: string | null;
  partyType?: "PERSON" | "ORGANIZATION";
  externalIdentifiers?: Array<{ scheme: string; value: string }>;
}) {
  const professionalName = input.professionalName.trim();
  if (professionalName.length < 2) throw new Error("Enter a contributor credit name.");
  const identifiers = (input.externalIdentifiers ?? []).map((item) => ({ scheme: item.scheme.trim().toUpperCase(), value: item.value.trim() })).filter((item) => item.scheme && item.value);
  const party = await prisma.contributorParty.create({
    data: {
      publicId: publicPartyId(),
      partyType: input.partyType ?? "PERSON",
      professionalName,
      displayName: professionalName,
      legalName: input.legalName?.trim() || null,
      country: input.country?.trim().toUpperCase() || null,
      email: normalizedEmail(input.email),
      createdByUserId: input.createdByUserId,
      externalIdentifiers: identifiers.length ? { create: identifiers } : undefined,
      nameHistory: { create: { professionalName, displayName: professionalName, changedByUserId: input.createdByUserId, reason: "Identity created" } }
    },
    include: { externalIdentifiers: true }
  });
  await logAuditEvent({ actorType: "user", actorId: input.createdByUserId, entityType: "contributor_party", entityId: party.id, action: "contributor.identity_created", newValue: { publicId: party.publicId, professionalName: party.professionalName, identityState: party.identityState } });
  return party;
}

export async function ensureClaimedContributorParty(userId: number, professionalName: string) {
  const existing = await prisma.contributorParty.findUnique({ where: { claimedByUserId: userId } });
  if (existing) return existing;
  const name = professionalName.trim();
  const party = await prisma.contributorParty.create({
    data: {
      publicId: publicPartyId(),
      professionalName: name,
      displayName: name,
      identityState: "CLAIMED",
      claimedByUserId: userId,
      createdByUserId: userId,
      nameHistory: { create: { professionalName: name, displayName: name, changedByUserId: userId, reason: "Account identity created" } }
    }
  });
  await logAuditEvent({ actorType: "user", actorId: userId, entityType: "contributor_party", entityId: party.id, action: "contributor.identity_created", newValue: { publicId: party.publicId, identityState: "CLAIMED" } });
  return party;
}

export async function searchContributorParties(userId: number, query: string, limit = 12) {
  const term = query.trim();
  const boundedLimit = Math.max(1, Math.min(limit, 25));
  const rows = await prisma.contributorParty.findMany({
    where: {
      mergedIntoId: null,
      ...(term ? { OR: [
        { publicId: { equals: term, mode: "insensitive" } },
        { professionalName: { contains: term, mode: "insensitive" } },
        { displayName: { contains: term, mode: "insensitive" } }
      ] } : { OR: [{ createdByUserId: userId }, { claimedByUserId: userId }] })
    },
    select: {
      id: true, publicId: true, professionalName: true, displayName: true, country: true, identityState: true,
      _count: { select: { contributions: true } },
      contributions: { where: { track: { release: { userId } } }, select: { id: true }, take: 1 }
    },
    take: boundedLimit * 2,
    orderBy: [{ updatedAt: "desc" }]
  });
  return rows
    .sort((a, b) => Number(Boolean(b.contributions.length)) - Number(Boolean(a.contributions.length)) || b._count.contributions - a._count.contributions)
    .slice(0, boundedLimit)
    .map(({ contributions, _count, ...party }) => ({ ...party, previousCollaborator: Boolean(contributions.length), creditsCount: _count.contributions }));
}

async function partyForCredit(db: any, actorUserId: number, contribution: CanonicalContributionInput) {
  if (contribution.partyId) {
    const party = await db.contributorParty.findFirst({ where: { id: contribution.partyId, mergedIntoId: null } });
    if (!party) throw new Error("The selected contributor identity is unavailable.");
    return { party, created: false };
  }
  const clientReference = contribution.clientReference?.trim();
  if (clientReference) {
    const identifier = await db.contributorExternalIdentifier.findUnique({ where: { scheme_value: { scheme: "HYMN_CREDIT_REF", value: `${actorUserId}:${clientReference}` } }, include: { party: true } });
    if (identifier?.party && !identifier.party.mergedIntoId) return { party: identifier.party, created: false };
  }
  const role = normalizeContributorRole(contribution.role);
  const creditedName = role && mapContributorRoleToDireNote(role) === "producer"
    ? String(contribution.artistName || contribution.name || "").trim()
    : String(contribution.legalName || contribution.name || "").trim();
  if (!creditedName) throw new Error("Contributor credit name is required.");
  const party = await db.contributorParty.create({
    data: {
      publicId: publicPartyId(),
      professionalName: creditedName,
      displayName: creditedName,
      legalName: contribution.legalName?.trim() || null,
      createdByUserId: actorUserId,
      externalIdentifiers: clientReference ? { create: { scheme: "HYMN_CREDIT_REF", value: `${actorUserId}:${clientReference}` } } : undefined,
      nameHistory: { create: { professionalName: creditedName, displayName: creditedName, changedByUserId: actorUserId, reason: "Created from release credit" } }
    }
  });
  return { party, created: true };
}

export async function syncTrackContributions(db: any, input: { trackId: number; actorUserId: number; contributions: CanonicalContributionInput[] }) {
  const desired: Array<{ partyId: number; role: ContributorRole; creditedName: string; legalNameSnapshot: string | null; providerRole: string | null; sequence: number }> = [];
  // Reuse identities across roles within this save, never by matching names.
  const resolvedParties = new Map<string, Awaited<ReturnType<typeof partyForCredit>>["party"]>();
  for (const [sequence, raw] of input.contributions.entries()) {
    const role = normalizeContributorRole(raw.role);
    if (!role) throw new Error(`Unsupported contributor role: ${raw.role}`);
    const providerRole = mapContributorRoleToDireNote(role);
    const creditedName = providerRole === "producer" ? String(raw.artistName || raw.name || "").trim() : String(raw.legalName || raw.name || "").trim();
    if (!creditedName) throw new Error(providerRole === "producer" ? "Producer artist name is required." : "Contributor legal name is required.");
    const identityKey = raw.partyId ? `party:${raw.partyId}` : raw.clientReference?.trim() ? `ref:${raw.clientReference.trim()}` : undefined;
    const cachedParty = identityKey ? resolvedParties.get(identityKey) : undefined;
    const { party, created } = cachedParty ? { party: cachedParty, created: false } : await partyForCredit(db, input.actorUserId, raw);
    if (identityKey) resolvedParties.set(identityKey, party);
    desired.push({ partyId: party.id, role, creditedName, legalNameSnapshot: raw.legalName?.trim() || null, providerRole, sequence });
    if (created) await db.auditLog.create({ data: { actorId: input.actorUserId, actorType: "user", actorRole: "release_owner", entity: "contributor_party", entityId: String(party.id), action: "contributor.identity_created", newValue: { publicId: party.publicId, professionalName: party.professionalName }, metadata: { source: "release_credit" } } });
  }
  const unique = new Map(desired.map((item) => [`${item.partyId}:${item.role}`, item]));
  const current = await db.trackContribution.findMany({ where: { trackId: input.trackId, source: "RELEASE_FORM" } });
  const currentByKey = new Map(current.map((item: any) => [`${item.partyId}:${item.role}`, item] as const));
  for (const item of unique.values()) {
    const previous = currentByKey.get(`${item.partyId}:${item.role}`) as any;
    if (previous && previous.creditedName === item.creditedName && previous.legalNameSnapshot === item.legalNameSnapshot && previous.providerRole === item.providerRole && previous.sequence === item.sequence) continue;
    await db.trackContribution.upsert({
      where: { trackId_partyId_role: { trackId: input.trackId, partyId: item.partyId, role: item.role } },
      create: { trackId: input.trackId, ...item, source: "RELEASE_FORM", createdByUserId: input.actorUserId },
      update: { creditedName: item.creditedName, legalNameSnapshot: item.legalNameSnapshot, providerRole: item.providerRole, sequence: item.sequence }
    });
  }
  const keep = new Set(unique.keys());
  const removed = current.filter((item: any) => !keep.has(`${item.partyId}:${item.role}`));
  if (removed.length) await db.trackContribution.deleteMany({ where: { id: { in: removed.map((item: any) => item.id) } } });
  await db.auditLog.create({ data: { actorId: input.actorUserId, actorType: "user", actorRole: "release_owner", entity: "track", entityId: String(input.trackId), action: "contributor.credits_synchronized", newValue: { contributions: [...unique.values()].map(({ partyId, role, creditedName }) => ({ partyId, role, creditedName })) }, metadata: { removedContributionIds: removed.map((item: any) => item.id) } } });
  return [...unique.values()];
}

export async function snapshotTrackContributions(submissionAttemptId: number, releaseId: number) {
  const contributions = await prisma.trackContribution.findMany({ where: { track: { releaseId } }, include: { track: true } });
  if (!contributions.length) return [];
  await prisma.trackContributionSnapshot.createMany({
    data: contributions.map((item) => ({
      submissionAttemptId,
      trackId: item.trackId,
      partyId: item.partyId,
      role: item.role,
      creditedName: item.creditedName,
      providerRole: item.providerRole,
      payload: { trackNumber: item.track.trackNumber, trackTitle: item.track.title, sequence: item.sequence }
    })),
    skipDuplicates: true
  });
  return contributions;
}

export async function createContributorInvitation(input: { partyId: number; invitedByUserId: number; email: string }) {
  const email = normalizedEmail(input.email);
  if (!email) throw new Error("Enter a valid invitation email.");
  const party = await prisma.contributorParty.findFirst({ where: { id: input.partyId, mergedIntoId: null } });
  if (!party) throw new Error("Contributor identity not found.");
  if (party.claimedByUserId) throw new Error("This contributor identity is already claimed.");
  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.contributorInvitation.create({ data: { partyId: party.id, email, tokenHash: invitationHash(token), invitedByUserId: input.invitedByUserId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
  await logAuditEvent({ actorType: "user", actorId: input.invitedByUserId, entityType: "contributor_party", entityId: party.id, action: "contributor.invited", newValue: { invitationId: invitation.id, expiresAt: invitation.expiresAt.toISOString() } });
  return { invitation, token };
}

export async function claimContributorInvitation(input: { token: string; userId: number; verifiedEmail: string }) {
  const invitation = await prisma.contributorInvitation.findUnique({ where: { tokenHash: invitationHash(input.token) }, include: { party: true } });
  if (!invitation || invitation.status !== "PENDING" || invitation.expiresAt <= new Date() || invitation.revokedAt) throw new Error("This contributor invitation is invalid or expired.");
  if (invitation.email !== input.verifiedEmail.trim().toLowerCase()) throw new Error("Sign in with the email address that received this invitation.");
  if (invitation.party.claimedByUserId && invitation.party.claimedByUserId !== input.userId) throw new Error("This contributor identity has already been claimed.");
  const claimed = await prisma.$transaction(async (tx) => {
    const existing = await tx.contributorParty.findUnique({ where: { claimedByUserId: input.userId } });
    if (existing && existing.id !== invitation.partyId) throw new Error("This account is already linked to a different contributor identity. Ask support to review a merge.");
    const party = await tx.contributorParty.update({ where: { id: invitation.partyId }, data: { claimedByUserId: input.userId, identityState: "CLAIMED" } });
    await tx.contributorInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", claimedByUserId: input.userId, acceptedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: input.userId, actorType: "user", actorRole: "contributor", entity: "contributor_party", entityId: String(party.id), action: "contributor.claimed", newValue: { publicId: party.publicId, userId: input.userId } } });
    return party;
  });
  return claimed;
}

export async function mergeContributorParties(input: { sourcePartyId: number; targetPartyId: number; adminUserId?: number | null; evidence: Record<string, unknown> }) {
  if (input.sourcePartyId === input.targetPartyId) throw new Error("Choose two different contributor identities.");
  if (!Object.keys(input.evidence).length) throw new Error("Document the verified evidence for this merge.");
  return prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.contributorParty.findFirst({ where: { id: input.sourcePartyId, mergedIntoId: null }, include: { producerProfile: true, externalIdentifiers: true } }),
      tx.contributorParty.findFirst({ where: { id: input.targetPartyId, mergedIntoId: null }, include: { producerProfile: true, externalIdentifiers: true } })
    ]);
    if (!source || !target) throw new Error("Both contributor identities must be active canonical records.");
    if (source.claimedByUserId && target.claimedByUserId && source.claimedByUserId !== target.claimedByUserId) throw new Error("Both identities are claimed by different accounts. Resolve account ownership before merging.");
    if (source.producerProfile && target.producerProfile) throw new Error("Both identities have producer profiles. Resolve the public profile conflict before merging.");
    const targetIdentifiers = new Set(target.externalIdentifiers.map((item) => `${item.scheme}:${item.value}`));
    const conflictingIdentifierIds = source.externalIdentifiers.filter((item) => targetIdentifiers.has(`${item.scheme}:${item.value}`)).map((item) => item.id);
    if (conflictingIdentifierIds.length) await tx.contributorExternalIdentifier.deleteMany({ where: { id: { in: conflictingIdentifierIds } } });
    await tx.contributorExternalIdentifier.updateMany({ where: { partyId: source.id }, data: { partyId: target.id } });
    const sourceContributions = await tx.trackContribution.findMany({ where: { partyId: source.id } });
    for (const contribution of sourceContributions) {
      const duplicate = await tx.trackContribution.findUnique({ where: { trackId_partyId_role: { trackId: contribution.trackId, partyId: target.id, role: contribution.role } } });
      if (duplicate) await tx.trackContribution.delete({ where: { id: contribution.id } });
      else await tx.trackContribution.update({ where: { id: contribution.id }, data: { partyId: target.id } });
    }
    await Promise.all([
      tx.artistCard.updateMany({ where: { contributorPartyId: source.id }, data: { contributorPartyId: target.id } }),
      tx.beat.updateMany({ where: { producerPartyId: source.id }, data: { producerPartyId: target.id } }),
      tx.beatSale.updateMany({ where: { producerPartyId: source.id }, data: { producerPartyId: target.id } }),
      tx.beatPurchase.updateMany({ where: { producerPartyId: source.id }, data: { producerPartyId: target.id } }),
      tx.splitRecipient.updateMany({ where: { contributorPartyId: source.id }, data: { contributorPartyId: target.id } }),
      tx.contributorInvitation.updateMany({ where: { partyId: source.id }, data: { partyId: target.id } }),
      tx.releaseTrackBeatLink.updateMany({ where: { producerPartyId: source.id }, data: { producerPartyId: target.id } }),
      tx.contributorNameHistory.updateMany({ where: { partyId: source.id }, data: { partyId: target.id } })
    ]);
    if (source.producerProfile && !target.producerProfile) await tx.producerProfile.update({ where: { id: source.producerProfile.id }, data: { contributorPartyId: target.id } });
    if (source.claimedByUserId && !target.claimedByUserId) await tx.contributorParty.update({ where: { id: target.id }, data: { claimedByUserId: source.claimedByUserId, identityState: source.identityState } });
    await tx.contributorParty.update({ where: { id: source.id }, data: { claimedByUserId: null, identityState: "MERGED", mergedIntoId: target.id } });
    const merge = await tx.producerIdentityMerge.create({ data: { sourcePartyId: source.id, targetPartyId: target.id, mergedByUserId: input.adminUserId ?? null, evidence: input.evidence as any } });
    await tx.auditLog.create({ data: { actorId: input.adminUserId ?? null, actorType: "admin", actorRole: "identity_manager", entity: "contributor_party", entityId: String(target.id), action: "contributor.identities_merged", previousValue: { sourcePartyId: source.id, sourcePublicId: source.publicId }, newValue: { targetPartyId: target.id, targetPublicId: target.publicId }, metadata: { mergeId: merge.id, evidence: input.evidence } as any } });
    return { merge, sourcePublicId: source.publicId, targetPublicId: target.publicId };
  });
}

export const contributorIdentityInternals = { invitationHash, publicPartyId };
