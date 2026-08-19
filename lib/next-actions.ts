import { prisma } from "@/lib/prisma";
import { getPayoutSummary } from "@/lib/payout";

export type NextAction = { key: string; title: string; reason: string; cta: string; href: string; priority: "critical" | "high" | "normal" };

export async function getNextActionsForUser(userId: number): Promise<NextAction[]> {
  const [releases, artistCount, purchases, producer, payout] = await Promise.all([
    prisma.release.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.artistCard.count({ where: { userId, archivedAt: null } }),
    prisma.beatPurchase.findMany({ where: { userId, hasAccess: true }, orderBy: { purchasedAt: "desc" }, take: 20 }),
    prisma.producerProfile.findUnique({ where: { userId } }),
    getPayoutSummary(userId)
  ]);
  const actions: NextAction[] = [];
  const correction = releases.find((release) => release.status === "CHANGES_REQUESTED" || release.status === "REJECTED");
  if (correction) actions.push({ key: `release:${correction.id}:fix`, title: "Fix your release", reason: `${correction.title} has corrections waiting.`, cta: "Review corrections", href: `/dashboard/releases?releaseId=${correction.id}&panel=redressal`, priority: "critical" });
  const draft = releases.find((release) => release.status === "DRAFT");
  if (draft) actions.push({ key: `release:${draft.id}:continue`, title: "Continue your release", reason: `${draft.title} is still a draft.`, cta: "Continue draft", href: `/distribution/start?draft=${draft.id}`, priority: "high" });
  const unusedBeat = purchases.find((purchase) => purchase.licenseUrl && !purchase.releaseId);
  if (unusedBeat) actions.push({ key: `beat:${unusedBeat.id}:release`, title: "Release with your purchased beat", reason: "Your license is ready and can prefill a distribution draft.", cta: "Start release", href: `/dashboard?tab=purchases&purchaseId=${unusedBeat.id}`, priority: "high" });
  const missingLicense = purchases.find((purchase) => !purchase.licenseUrl);
  if (missingLicense) actions.push({ key: `beat:${missingLicense.id}:license`, title: "Beat license is processing", reason: "Generate or request the license before starting distribution.", cta: "Open purchases", href: "/dashboard?tab=purchases", priority: "normal" });
  if (payout.availableBalance >= payout.minimumPayoutAmount) actions.push({ key: "payout:available", title: "Payout is available", reason: `Rs ${payout.availableBalance.toLocaleString("en-IN")} is available.`, cta: "Request payout", href: "/payout", priority: "high" });
  if (!artistCount) actions.push({ key: "artist:create", title: "Create your artist profile", reason: "An artist profile makes release metadata faster and safer.", cta: "Create profile", href: "/distribution/start", priority: "normal" });
  if (producer && !producer.active) actions.push({ key: "producer:inactive", title: "Complete producer setup", reason: "Your producer workspace is not active yet.", cta: "Open producer dashboard", href: "/producer/dashboard", priority: "normal" });
  const rank = { critical: 0, high: 1, normal: 2 };
  return actions.sort((a, b) => rank[a.priority] - rank[b.priority]).slice(0, 3);
}
