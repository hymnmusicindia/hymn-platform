import type { Metadata } from "next";
import { getCurrentUserForPage } from "@/lib/access";
import { getFirstReleaseEligibility } from "@/lib/first-release-promotion";
import { FirstReleaseFunnel } from "@/components/first-release-funnel";

export const metadata: Metadata = { title: "Your First Release Is Free | HYMN", description: "Distribute your first Single through HYMN with the ₹99 base release fee on us.", robots: { index: false, follow: false } };

export default async function FirstReleasePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUserForPage();
  const status = user ? await getFirstReleaseEligibility(user.id) : { eligible: false as const, reason: "authentication_required" };
  const params = (await searchParams) ?? {};
  const query = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return <FirstReleaseFunnel eligibility={{ authenticated: Boolean(user), eligible: status.eligible, reason: status.reason, firstName: user?.name.split(/\s+/)[0] }} query={query} />;
}
