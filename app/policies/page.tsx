import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { ContentPageShell } from "@/components/content-page-shell";
import { policyDocuments } from "@/lib/policy-content";

export const metadata: Metadata = { title: "Policy Center | HYMN", description: "HYMN platform, distribution, marketplace, rights, revenue, payout, verification, and safety policies." };

export default function PoliciesPage() {
  return <ContentPageShell eyebrow="Policy Center" title="Rules written for the HYMN platform." intro="Review the policies that govern accounts, distribution through DireNote, Beat Store licensing, royalties, payouts, verification, safety, and rights administration." lastUpdated="August 3, 2026" sections={[{ title: "Using this policy center", icon: <BookOpenCheck className="h-5 w-5" />, body: <p>Each document describes the workflow it governs. The Terms of Service apply across HYMN; a more specific policy also applies when you use that feature.</p> }]} children={<div className="grid gap-3 sm:grid-cols-2">{policyDocuments.map((policy) => <Link key={policy.slug} href={`/policies/${policy.slug}`} className="surface-card group p-5"><h2 className="text-lg font-semibold">{policy.title}</h2><p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{policy.summary}</p><span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">Read policy <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span></Link>)}</div>} />;
}
