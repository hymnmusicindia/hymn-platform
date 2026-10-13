import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudioShareCard } from "@/lib/studio-share-card";
import { StudioShareLink } from "@/components/studio-trust-actions";
export const dynamic="force-dynamic";
type Props={params:Promise<{type:string;id:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const p=await params,c=await getStudioShareCard(p.type,Number(p.id));return c?{title:c.title,description:c.body.slice(0,150),openGraph:{title:c.title,description:c.subtitle}}:{title:"Card unavailable",robots:{index:false,follow:false}};}
export default async function StudioSharePage({params}:Props){const p=await params,c=await getStudioShareCard(p.type,Number(p.id));if(!c)notFound();return <main className="shell py-16"><article className="mx-auto max-w-2xl rounded-[2rem] border border-[var(--border)] bg-[radial-gradient(ellipse_at_top_right,var(--accent-soft),var(--card))] p-8 sm:p-12"><p className="hymn-kicker">HYMN Studio · {c.score}</p><h1 className="my-6 text-4xl font-semibold tracking-tight">{c.title}</h1><p className="text-sm text-[var(--text-muted)]">{c.subtitle}</p><p className="my-8 whitespace-pre-wrap text-lg leading-8">{c.body}</p><div className="flex flex-wrap gap-3"><Link className="btn-primary" href={`/studio/engineers/${c.slug}`}>Work with {c.name}</Link>{c.workUrl?<a className="btn-outline" href={c.workUrl} target="_blank" rel="noreferrer">Hear the record</a>:null}<StudioShareLink path={`/studio/share/${p.type}/${p.id}`}/></div></article></main>}
