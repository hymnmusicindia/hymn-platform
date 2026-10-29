import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Music2, Disc3, Headphones, ChartNoAxesCombined, Folder } from "lucide-react";
import { getCurrentUserForPage } from "@/lib/access";
import { publicPageMetadata } from "@/lib/seo";
import { HymnStudioPage } from "@/components/hymn-studio-page";
import { HymnStudioEngineers, type StudioQuery } from "@/components/hymn-studio-engineers";
import s from "@/components/hymn-studio.module.css";
import { HymnStudioLogo } from "@/components/hymn-studio-logo";
export const dynamic = "force-dynamic";
export const metadata: Metadata = publicPageMetadata("HYMN Studio ? Your Music Workspace", "Manage releases, finish your recordings, find engineers, track your music and grow your business in HYMN Studio.", "/studio");

export default async function StudioPage({ searchParams }: { searchParams: Promise<StudioQuery> }) {
  const [query,user] = await Promise.all([searchParams,getCurrentUserForPage()]);
  if (user) return <HymnStudioPage user={user} query={query}/>;
  if (query.view === 'projects' || query.tab) redirect('/login?next=' + encodeURIComponent('/studio?' + new URLSearchParams(query.view === 'projects' ? {view:'projects'} : {tab:query.tab!}).toString()));
  return <div className={s.studio} style={{display:"block"}}><main className={s.guest}>
    <section className={s.guestHero}><div><HymnStudioLogo/><h1>Your music business.<br/>One creative workspace.</h1><p>Release your music. Work with engineers. Keep your files, licences, projects and progress together.</p><Link prefetch={false} href="/login?next=%2Fstudio" className={s.primary}>Open your Studio ?</Link></div><div className={s.guestPreview} aria-label="Studio tools preview"><h2>Make your next move.</h2><p>A home for everything you create.</p><div className={s.metrics}>{[[Disc3,"Releases","Prepare & distribute"],[Headphones,"Projects","Mix & master"],[ChartNoAxesCombined,"Analytics","Understand your music"],[Folder,"My library","Files & agreements"]].map(([Icon,title,detail])=>{const I=Icon as typeof Music2;return <div className={s.metric} key={String(title)}><span><I/>{String(title)}</span><strong>{String(detail)}</strong></div>})}</div></div></section>
    <section style={{marginTop:40}}><HymnStudioEngineers query={query}/></section>
  </main></div>;
}
