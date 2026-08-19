import { BookOpenCheck } from "lucide-react";
import { ContentPageShell } from "@/components/content-page-shell";
import type { PolicyDocument as Policy } from "@/lib/policy-content";

export function PolicyDocument({ policy }: { policy: Policy }) {
  return <ContentPageShell eyebrow="HYMN Policy" title={policy.title} intro={policy.summary} lastUpdated="August 3, 2026" sections={policy.sections.map((section, index) => ({ title: `${index + 1}. ${section.title}`, icon: <BookOpenCheck className="h-5 w-5" />, body: <>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.items ? <ul className="list-disc space-y-2 pl-5">{section.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}</> }))} footerCta={{ title: "Questions about this policy?", body: "Contact HYMN with the relevant account, release, payment, payout, purchase, or claim reference.", href: "/contact", label: "Contact Support" }} />;
}
