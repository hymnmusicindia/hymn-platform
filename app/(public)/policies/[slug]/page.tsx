import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PolicyDocument } from "@/components/policy-document";
import { getPolicy, policyDocuments } from "@/lib/policy-content";

export function generateStaticParams() { return policyDocuments.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const slug = (await params).slug; const policy = getPolicy(slug); return policy ? { title: policy.title, description: policy.summary, alternates: { canonical: `/policies/${slug}` } } : {}; }
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) { const policy = getPolicy((await params).slug); if (!policy) notFound(); return <PolicyDocument policy={policy} />; }
