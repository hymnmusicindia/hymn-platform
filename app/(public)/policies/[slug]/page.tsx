import type { Metadata } from "next";
import { publicPageMetadata, policyCanonicalPath, privateRobots } from "@/lib/seo";
import { notFound } from "next/navigation";
import { PolicyDocument } from "@/components/policy-document";
import { getPolicy, policyDocuments } from "@/lib/policy-content";

export function generateStaticParams() { return policyDocuments.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const slug = (await params).slug; const policy = getPolicy(slug); return policy ? publicPageMetadata(policy.title,policy.summary,policyCanonicalPath(slug)) : {robots:privateRobots}; }
export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) { const policy = getPolicy((await params).slug); if (!policy) notFound(); return <PolicyDocument policy={policy} />; }
