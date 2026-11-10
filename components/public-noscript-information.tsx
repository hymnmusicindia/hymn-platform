import Link from "next/link";
import { publicBusiness, publicServices } from "@/lib/public-business";
import { distributionPlanCards } from "@/lib/distribution-plans";
import { publicPricingNotes } from "@/lib/public-agent-content";
import { DISTRIBUTION_POLICY_SUMMARY } from "@/lib/policy-content";

/** Streamed Suspense segments need JS to reveal; keep essential public facts readable without it. */
export function PublicNoScriptInformation() {
  return <noscript>
    <style>{"[data-workspace-loading]{display:none!important}"}</style>
    <section aria-label="Public information without JavaScript" className="shell py-10">
      <h1 className="text-3xl font-semibold">HYMN Music</h1><p className="mt-4 text-sm leading-7">{publicBusiness.description}</p>
      <h2 className="mt-8 text-xl font-semibold">Distribution pricing</h2>
      <ul className="mt-4 space-y-3">{distributionPlanCards.map(plan => <li key={plan.key}><strong>{plan.title}: <span>₹{plan.price.toLocaleString("en-IN")}</span></strong> / {plan.cadence}. {plan.artistLimit} artist profiles.</li>)}</ul>
      <p className="mt-4 text-sm leading-7">{publicPricingNotes}</p><p className="mt-3 text-sm leading-7">{DISTRIBUTION_POLICY_SUMMARY}</p>
      <p className="mt-4"><Link className="underline" href="/pricing">Distribution pricing and fees</Link> · <Link className="underline" href="/first-release">First-release eligibility</Link></p>
      <h2 className="mt-8 text-xl font-semibold">Services</h2><ul className="mt-4 space-y-2">{publicServices.map(service => <li key={service.key}><Link className="underline" href={service.path}>{service.name}</Link>: {service.description}</li>)}</ul>
      <h2 className="mt-8 text-xl font-semibold">Contact HYMN</h2><p className="mt-4 flex flex-wrap gap-4"><a className="underline" href={`mailto:${publicBusiness.email}`}>{publicBusiness.email}</a><a className="underline" href={`tel:${publicBusiness.telephone}`}>{publicBusiness.telephone}</a><Link className="underline" href="/contact">Contact</Link></p>
      <p className="mt-6 text-sm"><Link className="underline" href="/index.md">Text version of HYMN</Link> · <Link className="underline" href="/policies">Policies</Link></p>
    </section>
  </noscript>;
}
