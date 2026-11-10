import Link from "next/link";
import { publicBusiness } from "@/lib/public-business";
import { homeStructuredData, publicFaqs } from "@/lib/public-agent-content";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { jsonLd } from "@/lib/seo";

export function PublicHomeInformation() {
  return <section className="shell py-10" aria-labelledby="public-information-title">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(homeStructuredData(getPublicAppUrl())) }}/>
    <h2 id="public-information-title" className="text-2xl font-semibold">Plan your next release</h2>
    <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">Compare <Link className="underline" href="/pricing">distribution pricing and optional fees</Link>, or talk to HYMN about your music.</p>
    <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm"><a className="underline" href={`mailto:${publicBusiness.email}`}>{publicBusiness.email}</a><a className="underline" href={`tel:${publicBusiness.telephone}`}>{publicBusiness.telephone}</a><Link className="underline" href="/contact">Contact HYMN</Link></p>
    <div className="mt-6 grid gap-3">{publicFaqs.map(faq => <details key={faq.question} className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer font-medium">{faq.question}</summary><p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{faq.answer}</p></details>)}</div>
  </section>;
}
