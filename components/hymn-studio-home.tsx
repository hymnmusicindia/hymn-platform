"use client";
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Bell, Disc3, Headphones, Music2, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Beat, Notification, Release, User } from '@/lib/types';
import { artworkPreviewUrl } from '@/lib/artwork-preview';
import { customerMessage } from '@/lib/customer-message';
import { studioTools } from '@/lib/studio-navigation';
import { StudioIcon } from './hymn-studio-frame';
import s from './hymn-studio.module.css';

export type StudioProjectSummary = { publicId: string; projectTitle: string; status: string; updatedAt: string; engineerName: string; deliveryCount: number };
const money = (amount?: number | null) => amount == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
const pretty = (value: string) => value.replaceAll('_', ' ').toLowerCase();
export function StudioPanel({ title, href, action = 'View all', children }: { title: string; href?: string; action?: string; children: ReactNode }) { return <section className={s.panel}><header className={s.panelHeader}><h2>{title}</h2>{href && <Link prefetch={false} href={href}>{action}<ArrowUpRight size={13}/></Link>}</header><div className={s.panelBody}>{children}</div></section>; }
export function StudioEmpty({ title, children }: { title: string; children?: ReactNode }) { return <div className={s.empty}><strong>{title}</strong>{children}</div>; }
export function StudioProjectList({ projects }: { projects: StudioProjectSummary[] }) { return projects.length ? <div className={s.projectGrid}>{projects.map(project => <Link prefetch={false} href={`/studio/orders/${project.publicId}`} className={s.projectCard} key={project.publicId}><span className={s.badge}>{pretty(project.status)}</span><h2>{project.projectTitle}</h2><p>{project.engineerName}</p><footer><span>{project.deliveryCount} deliveries · {new Date(project.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span><ArrowUpRight size={16}/></footer></Link>)}</div> : <StudioPanel title="Your projects"><StudioEmpty title="Your next track starts here">Choose an engineer, share your recording and manage the project from first mix to final master.<br/><Link prefetch={false} href="/studio?view=engineers">Find your engineer →</Link></StudioEmpty></StudioPanel>; }

export function HymnStudioHome({ user, releases, notifications, projects = [], projectsError, earnings, plan, purchaseCount, onTab, producer, errors = {}, onRetry }: {
  errors?: Record<string,string>; onRetry?: () => void; user: User; releases: Release[]; notifications: Notification[]; projects?: StudioProjectSummary[]; projectsError?: boolean; earnings?: { availableBalance: number } | null; plan?: string; purchaseCount?: number; onTab: (tab: any) => void;
  producer?: { beats: Beat[]; finance: any };
}) {
  const newest = [...releases].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const attention = releases.filter(release => ['changes_requested','rejected','failed'].includes(release.status));
  const drafts = releases.filter(release => release.status.startsWith('draft'));
  const live = releases.filter(release => release.status === 'live');
  const activeProjects = projects.filter(project => !['COMPLETED','CANCELLED','REFUNDED','EXPIRED'].includes(project.status));
  const beats = producer?.beats || [];
  const metrics = producer ? [
    { label: 'Your beats', value: beats.length, detail: 'Your complete catalogue', icon: <Disc3/> },
    { label: 'Published', value: beats.filter(beat => beat.enabled && beat.status === 'PUBLISHED').length, detail: 'Available in the Beatstore', icon: <Music2/> },
    { label: 'Recorded sales', value: producer.finance.beatsSold ?? producer.finance.sales?.length ?? '—', detail: 'From your sales records', icon: <Headphones/> },
    { label: 'Available balance', value: money(producer.finance.availableBalance), detail: 'Your producer earnings', icon: <Wallet/> },
  ] : [
    { label: 'Your releases', value: releases.length, detail: `${live.length} live · ${drafts.length} drafts`, icon: <Disc3/> },
    { label: 'Active projects', value: projectsError ? '—' : activeProjects.length, detail: projectsError ? 'Projects temporarily unavailable' : 'Mixing & mastering', icon: <Headphones/> },
    { label: 'Needs attention', value: attention.length, detail: attention.length ? 'Review release feedback' : 'No release corrections pending', icon: <Bell/> },
    { label: 'Available balance', value: money(earnings?.availableBalance), detail: errors.payout ? 'Balance temporarily unavailable' : earnings ? 'Reported royalties' : 'Loading your balance', icon: <Wallet/> },
  ];
  const stages = [{ label: 'Live', count: live.length, color: 'var(--studio-success)' }, { label: 'In progress', count: releases.length-live.length-drafts.length-attention.length, color: 'var(--studio-accent)' }, { label: 'Drafts', count: drafts.length, color: 'var(--info)' }, { label: 'Corrections', count: attention.length, color: 'var(--studio-warning)' }];
  return <div>
    <header className={s.heading}><div><p className={s.eyebrow}>{producer ? 'Your producer workspace' : 'Your creative workspace'}</p><h1>Good to see you, {user.name.split(' ')[0]}.</h1><p>{producer ? 'Your catalogue, customers and next big idea.' : 'Everything you need to take your music further.'}</p></div><span>Let’s make something great.</span></header>
    {Object.entries(errors).filter(([key]) => ['payout','notifications'].includes(key)).map(([key,message]) => <div className={s.notice} role="alert" key={key}>{message}{onRetry && <button type="button" onClick={onRetry} style={{marginLeft:8,border:0,background:'transparent',color:'var(--studio-accent)'}}>Retry</button>}</div>)}
    <section className={s.metrics} aria-label="Studio quick stats">{metrics.map(metric => <div className={s.metric} key={metric.label}><span>{metric.icon}{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>)}</section>
    <div className={s.overviewGrid}>
      <div className={s.stack}>
        <section className={s.feature}><div><p>MAKE YOUR NEXT MOVE</p><h2>{producer ? 'Make room for your next hit.' : 'From an idea to your next release.'}</h2><p>{producer ? 'Upload your sound. Set your terms. Build your music business.' : 'Find your sound, finish your master and get your music out into the world.'}</p>{producer ? <a href="/producer/dashboard?tab=upload">Upload a beat <ArrowRight size={14}/></a> : <Link prefetch={false} href="/distribution/start">Create a release <ArrowRight size={14}/></Link>}</div><div className={s.featureArt} aria-hidden="true"><span><Music2/></span></div></section>
        <StudioPanel title="Quick tools"><div className={s.quickTools}>{studioTools.map(tool => <Link prefetch={false} key={tool.title} href={tool.href}><StudioIcon name={tool.icon}/><strong>{tool.title}</strong><small>{tool.detail}</small></Link>)}</div></StudioPanel>
        <StudioPanel title={producer ? 'Your latest beats' : 'Recent releases'} href={producer ? '/producer/dashboard?tab=catalog' : '/dashboard/releases'}>{producer ? beats.slice().sort((a,b) => b.id-a.id).slice(0,4).map(beat => <div className={s.record} key={beat.id}>{beat.artworkUrl ? <img src={artworkPreviewUrl(beat.artworkUrl, 96)} alt="" loading="lazy"/> : <span className={s.recordIcon}><Disc3 size={18}/></span>}<div><strong>{beat.title}</strong><small>{beat.bpm} BPM · {beat.genre}</small></div><Link prefetch={false} href="/producer/dashboard?tab=catalog">Manage ↗</Link></div>) : newest.slice(0,4).map(release => <div className={s.record} key={release.id}>{release.artworkUrl ? <img src={artworkPreviewUrl(release.artworkUrl, 96)} alt="" loading="lazy"/> : <span className={s.recordIcon}><Disc3 size={18}/></span>}<div><strong>{release.releaseTitle || release.trackName}</strong><small>{release.artistName}</small></div><Link prefetch={false} href={`/dashboard/releases/${release.id}`}><span className={s.badge}>{pretty(release.status)}</span></Link></div>)}{!(producer ? beats.length : releases.length) && <StudioEmpty title={producer ? 'Build your catalogue' : 'Your music belongs here'}>{producer ? 'Upload a beat from Producer tools to get started.' : 'Your releases and their latest status will appear here.'}</StudioEmpty>}</StudioPanel>
      </div>
      <aside className={s.stack}>
        <StudioPanel title="Your next steps">{attention.slice(0,2).map(release => <div className={s.record} key={release.id}><span className={s.recordIcon}><Bell size={17}/></span><div><strong>Review release feedback</strong><small>{release.releaseTitle || release.trackName}</small><Link prefetch={false} href={`/dashboard/releases/${release.id}`}>Open release →</Link></div></div>)}{drafts.slice(0,1).map(release => <div className={s.record} key={release.id}><span className={s.recordIcon}><Disc3 size={17}/></span><div><strong>Pick up where you left off</strong><small>{release.releaseTitle || release.trackName || 'Untitled draft'}</small><Link prefetch={false} href={`/distribution/start?edit=${release.id}`}>Continue draft →</Link></div></div>)}{!attention.length && !drafts.length && <StudioEmpty title="You’re ready for what’s next">Start a release or explore the tools for your next recording.</StudioEmpty>}</StudioPanel>
        <StudioPanel title={producer ? 'Producer updates' : 'Activity'} action="Open inbox" href={producer ? '/producer/dashboard?tab=messages' : '/studio?tab=messages'}>{notifications.slice(0,3).map(notification => <div className={s.record} key={notification.id}><span className={s.recordIcon}><Bell size={15}/></span><div><strong>{customerMessage(notification.title)}</strong><small>{new Date(notification.createdAt).toLocaleDateString('en-IN',{day:'numeric',month:'short',timeZone:'Asia/Kolkata'})}</small></div><button type="button" aria-label={`Open notification: ${customerMessage(notification.title)}`} onClick={() => onTab('messages')} style={{border:0,background:'transparent',color:'var(--studio-accent)'}}><ArrowUpRight size={14}/></button></div>)}{!notifications.length && <StudioEmpty title={errors.notifications ? "Updates temporarily unavailable" : "All caught up"}>Your release, project and account updates will appear here.</StudioEmpty>}</StudioPanel>
        {!producer && <StudioPanel title="Release pipeline" href="/dashboard/releases"><div className={s.progress}>{stages.map(stage => <span key={stage.label} style={{width:`${releases.length ? stage.count/releases.length*100 : 0}%`,background:stage.color}}/>)}</div><div className={s.legend}>{stages.map(stage => <span key={stage.label}><i style={{background:stage.color}}/>{stage.label}<b>{stage.count}</b></span>)}</div></StudioPanel>}
        {!producer && <StudioPanel title="Your workspace"><div className={s.record}><div><strong>{plan || 'No active plan'}</strong><small>{purchaseCount ?? 0} beat purchases in your library</small></div><Link prefetch={false} href="/studio?tab=subscription">Manage ↗</Link></div><div className={s.record}><div><strong>Mixing & mastering</strong><small>{projectsError ? 'Projects could not be loaded' : `${activeProjects.length} active projects`}</small></div><Link prefetch={false} href="/studio?view=projects">Open ↗</Link></div></StudioPanel>}
      </aside>
    </div>
  </div>;
}
