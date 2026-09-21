import { prisma } from "../lib/prisma";

type Finding = { classification: "SAFE_LINK" | "POSSIBLE_DUPLICATE" | "AMBIGUOUS" | "MANUAL_REVIEW"; source: string; sourceId: string; name?: string; evidence: string[]; proposedPartyId?: string };

function normalizeName(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ");
}

async function main() {
  const [users, beats, tracks, splitRecipients, purchases] = await Promise.all([
    prisma.user.findMany({ where: { OR: [{ role: "PRODUCER" }, { producerProfile: { isNot: null } }] }, select: { id: true, name: true, email: true, producerProfile: { select: { id: true, displayName: true, contributorPartyId: true } } } }),
    prisma.producerProfile.findMany({ select: { id: true, userId: true, displayName: true, contributorPartyId: true } }),
    prisma.beat.findMany({ select: { id: true, userId: true, producerPartyId: true } }),
    prisma.track.findMany({ select: { id: true, releaseId: true, metadata: true } }),
    prisma.splitRecipient.findMany({ select: { id: true, recipientUserId: true, recipientName: true, recipientEmail: true, contributorPartyId: true } }),
    prisma.beatPurchase.findMany({ select: { id: true, beatId: true, producerPartyId: true, licenseTermsSnapshot: true } })
  ]);
  const findings: Finding[] = [];
  const claimedNames = new Map<string, typeof users>();
  for (const user of users) {
    const name = user.producerProfile?.displayName || user.name;
    const normalized = normalizeName(name);
    claimedNames.set(normalized, [...(claimedNames.get(normalized) ?? []), user]);
    findings.push({ classification: "SAFE_LINK", source: "User/ProducerProfile", sourceId: String(user.id), name, evidence: ["same authenticated user owns producer profile and seller inventory"], proposedPartyId: user.producerProfile?.contributorPartyId ? String(user.producerProfile.contributorPartyId) : undefined });
  }
  for (const [name, matches] of claimedNames) if (matches.length > 1) findings.push({ classification: "POSSIBLE_DUPLICATE", source: "ProducerProfile", sourceId: matches.map((item) => item.producerProfile?.id).filter(Boolean).join(","), name, evidence: ["normalized professional name matches", "name alone is insufficient to merge"] });
  for (const beat of beats) findings.push({ classification: beat.producerPartyId ? "SAFE_LINK" : "SAFE_LINK", source: "Beat", sourceId: String(beat.id), evidence: [`authenticated seller user ${beat.userId} owns beat`, beat.producerPartyId ? `already linked to Party ${beat.producerPartyId}` : "backfill to seller user's claimed Party"] });
  for (const track of tracks) {
    const meta = track.metadata && typeof track.metadata === "object" ? track.metadata as Record<string, unknown> : {};
    const contributors = Array.isArray(meta.contributors) ? meta.contributors as Array<Record<string, unknown>> : [];
    for (const [index, contributor] of contributors.entries()) {
      const role = String(contributor.role ?? "");
      const name = String(contributor.name ?? (role === "producer" ? contributor.artistName : contributor.legalName) ?? "").trim();
      if (!name) continue;
      const matches = claimedNames.get(normalizeName(name)) ?? [];
      findings.push({ classification: matches.length > 1 ? "AMBIGUOUS" : contributor.partyId ? "SAFE_LINK" : "MANUAL_REVIEW", source: "Track.metadata.contributors", sourceId: `${track.id}:${index}`, name, evidence: contributor.partyId ? [`explicit Party ${contributor.partyId}`] : matches.length ? [`${matches.length} name-only candidate(s)`, "no verified identifier on legacy credit"] : ["plain-text legacy credit", "no account, external ID, or invitation evidence"] });
    }
  }
  for (const recipient of splitRecipients) findings.push({ classification: recipient.contributorPartyId || recipient.recipientUserId ? "SAFE_LINK" : "MANUAL_REVIEW", source: "SplitRecipient", sourceId: String(recipient.id), name: recipient.recipientName, evidence: recipient.contributorPartyId ? [`explicit Party ${recipient.contributorPartyId}`] : recipient.recipientUserId ? [`verified recipient user ${recipient.recipientUserId}`] : ["email/name-only financial beneficiary", "must not merge by email or name without claim evidence"] });
  for (const purchase of purchases) findings.push({ classification: purchase.producerPartyId ? "SAFE_LINK" : "MANUAL_REVIEW", source: "BeatPurchase agreement snapshot", sourceId: String(purchase.id), evidence: purchase.producerPartyId ? [`explicit Party ${purchase.producerPartyId}`, "immutable agreement snapshot retained"] : ["legacy agreement snapshot has seller User ID only", `derive from Beat ${purchase.beatId} after seller Party backfill`] });
  const counts = findings.reduce<Record<string, number>>((result, finding) => ({ ...result, [finding.classification]: (result[finding.classification] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ dryRun: true, generatedAt: new Date().toISOString(), counts, findings }, null, 2));
}

main().finally(() => prisma.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
