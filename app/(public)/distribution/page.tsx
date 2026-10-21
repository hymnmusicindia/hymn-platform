import { redirect } from "next/navigation";

export const metadata = { title: "Add release", robots: { index: false, follow: false } };

/** Keep old links working without displaying the retired distribution landing page. */
export default async function DistributionPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams ?? {};
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const recommended = first(params.recommended);
  const showPlans = first(params.manage) === "plans" || ["half-yearly", "half_yearly", "yearly", "yearly_plus"].includes(recommended || "");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "manage" || key === "recommended") continue;
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  if (showPlans) query.set("subscriptions", "1");
  redirect(`/distribution/start${query.size ? `?${query}` : ""}`);
}
