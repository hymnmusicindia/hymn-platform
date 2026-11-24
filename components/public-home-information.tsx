import { homeStructuredData, publicHomeFaqs } from "@/lib/public-agent-content";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { jsonLd } from "@/lib/seo";

export function PublicHomeInformation() {
  return <section className="shell py-10" aria-labelledby="public-information-title">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(homeStructuredData(getPublicAppUrl(), publicHomeFaqs)) }}/>
    <h2 id="public-information-title" className="sr-only">Frequently asked questions</h2>
    <div className="grid gap-3">{publicHomeFaqs.map(faq => <details key={faq.question} className="rounded-xl border border-[var(--border)] p-4"><summary className="cursor-pointer font-medium">{faq.question}</summary><p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{faq.answer}</p></details>)}</div>
  </section>;
}
