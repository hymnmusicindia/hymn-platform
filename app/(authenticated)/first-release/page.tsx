import { publicPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { getCurrentUserForPage } from "@/lib/access";
import { getFirstReleaseEligibility } from "@/lib/first-release-promotion";
import { FirstReleaseFunnel } from "@/components/first-release-funnel";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  ...publicPageMetadata("Your First Release Is Free", "Distribute your first Single through HYMN with the base release fee on us. Review eligibility and current terms before submitting.", "/first-release"),
  robots: {index:true,follow:true,googleBot:{index:true,follow:true}}
};

export default async function FirstReleasePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUserForPage();
  const params = (await searchParams) ?? {};
  const draft = user ? await prisma.release.findFirst({ where: { userId: user.id, archivedAt: null, status: "DRAFT", releaseType: "single", metadata: { path: ["promotionCode"], equals: "FIRST_RELEASE_FREE" } }, orderBy: { updatedAt: "desc" }, select: { id: true } }) : null;
  const status = user ? await getFirstReleaseEligibility(user.id, draft?.id) : { eligible: false as const, reason: "authentication_required" };
  const query = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return <FirstReleaseFunnel eligibility={{ authenticated: Boolean(user), eligible: status.eligible, reason: status.reason, firstName: user?.name.split(/\s+/)[0], draftId: draft?.id }} query={query} />;
}
