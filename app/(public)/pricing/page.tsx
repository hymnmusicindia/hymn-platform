import Link from "next/link";
import { distributionPlanCards } from "@/lib/distribution-plans";
import { publicPageMetadata, jsonLd } from "@/lib/seo";
import { publicOffers, publicPricingNotes } from "@/lib/public-agent-content";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { DISTRIBUTION_POLICY_SUMMARY } from "@/lib/policy-content";

export const metadata = publicPageMetadata("Music Distribution Pricing", "Compare HYMN distribution prices in INR, subscriptions, optional fees and royalty terms. Public pricing with no sign-in required.", "/pricing");
export default function PricingPage() {
  const origin = getPublicAppUrl();
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "Service", "@id": `${origin}/#service-distribution`, name: "HYMN Music distribution", provider: { "@id": `${origin}/#organization` }, offers: publicOffers(origin) },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "HYMN Music", item: origin }, { "@type": "ListItem", position: 2, name: "Pricing", item: `${origin}/pricing` }] },
  ] };
  return <main className="shell py-12">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}/>
    <h1 className="text-4xl font-semibold">Music distribution pricing</h1>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--text-muted)]">Compare plans before creating an account. All prices below are in Indian rupees (INR). Payment and release submission require signing in.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{distributionPlanCards.map(plan => <article id={plan.key} key={plan.key} className="scroll-mt-24 rounded-xl border border-[var(--border)] p-5">
      <h2 className="text-xl font-semibold">{plan.title}</h2><p className="mt-4 text-3xl font-semibold">₹{plan.price.toLocaleString("en-IN")}</p><p className="mt-2 text-sm text-[var(--text-muted)]">{plan.cadence}</p>
      <ul className="my-5 list-disc space-y-2 pl-4 text-sm leading-6">{plan.featureList.map(feature => <li key={feature}>{feature}</li>)}</ul>
      <Link href={plan.key === "one_time" ? "/distribution/start" : `/distribution/start?subscriptions=1&recommended=${plan.key}`} className="underline">{plan.cta}</Link>
    </article>)}</div>
    <section className="mt-10 max-w-3xl"><h2 className="text-2xl font-semibold">Optional fees and eligibility</h2><p className="mt-4 text-sm leading-8 text-[var(--text-muted)]">{publicPricingNotes}</p><Link href="/first-release" className="mt-3 inline-block underline">First-release discount eligibility</Link></section>
    <section className="mt-10 max-w-3xl"><h2 className="text-2xl font-semibold">Royalty terms</h2><p className="mt-4 text-sm leading-8 text-[var(--text-muted)]">{DISTRIBUTION_POLICY_SUMMARY}</p><Link href="/policies" className="mt-3 inline-block underline">Read the policies</Link></section>
    <p className="mt-10 text-sm">Beat licences and Studio services have listing-specific prices. Browse the <Link className="underline" href="/beat-store">beat store</Link> or <Link className="underline" href="/studio">engineer services</Link> for current offers.</p>
  </main>;
}
