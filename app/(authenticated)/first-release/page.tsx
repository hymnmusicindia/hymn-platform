import type { Metadata } from "next";
import { getCurrentUserForPage } from "@/lib/access";
import { getFirstReleaseEligibility } from "@/lib/first-release-promotion";
import { FirstReleaseFunnel } from "@/components/first-release-funnel";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Your First Release Is Free | HYMN",
  description: "Distribute your first Single through HYMN with the ₹99 base release fee on us.",
  alternates: { canonical: "/first-release" },
  robots: { index: true, follow: true },
};

export default async function FirstReleasePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUserForPage();
  const status = user ? await getFirstReleaseEligibility(user.id) : { eligible: false as const, reason: "authentication_required" };
  const params = (await searchParams) ?? {};
  const draft = user && status.eligible ? await prisma.release.findFirst({ where: { userId: user.id, archivedAt: null, status: "DRAFT", releaseType: "single", metadata: { path: ["promotionCode"], equals: "FIRST_RELEASE_FREE" } }, orderBy: { updatedAt: "desc" }, select: { id: true } }) : null;
  const query = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return <FirstReleaseFunnel eligibility={{ authenticated: Boolean(user), eligible: status.eligible, reason: status.reason, firstName: user?.name.split(/\s+/)[0], draftId: draft?.id }} query={query} />;
}
