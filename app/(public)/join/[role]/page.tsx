import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { creatorPaths } from '@/lib/creator-paths';
import { CreatorPathPreview } from '@/components/creator-path-preview';
import { CreatorBenefits } from '@/components/creator-benefits';
import { getSession } from '@/lib/session';
import './page.css';

export async function generateMetadata({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  return { title: `${role === 'engineer' ? 'Join HYMN Studio' : 'Become a playlist curator'} | HYMN` };
}
export default async function CreatorEntry({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  if (role !== 'engineer' && role !== 'curator') notFound();
  const path = creatorPaths[role];
  const session = await getSession();
  const href = session ? path.href : `/login?next=${encodeURIComponent(path.href)}`;
  return <main className="creator-entry">
    <header><Link href="/" aria-label="HYMN home"><Image src="/assets/hymnlogowhite.png" alt="HYMN Music" width={112} height={38} priority/></Link><Link href="/#creator-invitation"><ArrowLeft size={15}/> All creator paths</Link></header>
    <div className="creator-entry-hero">
      <section className="creator-entry-intro"><p className="creator-entry-kicker">{path.eyebrow}</p><h1>{role === 'engineer' ? <>Great sound.<br/><span>Starts with you.</span></> : <>Good taste.<br/><span>New possibilities.</span></>}</h1><p className="creator-entry-copy">{path.copy}</p></section>
      <aside className="creator-entry-art" aria-label={path.preview}><CreatorPathPreview role={role}/></aside>
      <div className="creator-entry-actions"><Link href={href} className="creator-entry-primary">{path.action}<ArrowRight size={17}/></Link><p className="creator-entry-login">{session ? 'Continue with your HYMN account.' : 'One HYMN account. A new chapter for your craft.'}</p></div>
      <ol className="creator-entry-steps">{path.steps.map((step,i)=><li key={step}><span>0{i+1}</span>{step}</li>)}</ol>
    </div>
    <div className="creator-entry-information"><details className="creator-entry-ready"><summary>What should I have ready?</summary><ul>{path.needs.map(need=><li key={need}><Check size={15}/>{need}</li>)}</ul></details><CreatorBenefits role={role}/></div>
    <p className="creator-entry-note">{path.note}</p>
  </main>;
}
