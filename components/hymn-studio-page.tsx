import Link from 'next/link';
import { Suspense } from 'react';
import type { User } from '@/lib/types';
import { listOrdersByUser, listReleasesByUser, getSubscriptionByUserId, getBeatPurchasesByUser } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { CustomerDashboardShell } from '@/components/customer-dashboard-shell';
import { StudioClientExtras } from '@/components/studio-client-extras';
import { HymnStudioEngineers, type StudioQuery } from './hymn-studio-engineers';
import { StudioProjectList, type StudioProjectSummary } from './hymn-studio-home';
import s from './hymn-studio.module.css';

async function ProjectExtras({ userId }: { userId:number }) {
  try { return await StudioClientExtras({ userId }); }
  catch { return <p className={s.notice} role="alert">Consultations and credit permissions could not be loaded. <Link prefetch={false} href="/studio?view=projects">Reload projects</Link></p>; }
}

export async function HymnStudioPage({ user, query }: { user: User; query: StudioQuery }) {
  const [releases, orders, subscription, purchases, projectResult] = await Promise.all([
    listReleasesByUser(user.id), listOrdersByUser(user.id), getSubscriptionByUserId(user.id), getBeatPurchasesByUser(user.id),
    prisma.studioServiceOrder.findMany({ where:{ customerId:user.id }, select:{publicId:true,projectTitle:true,status:true,updatedAt:true,engineerProfile:{select:{professionalName:true}},_count:{select:{deliveries:true}}}, orderBy:{updatedAt:'desc'} }).then(rows => ({ rows, error:false })).catch(() => ({ rows:[], error:true })),
  ]);
  const projects: StudioProjectSummary[] = projectResult.rows.map(order => ({ publicId:order.publicId,projectTitle:order.projectTitle,status:order.status,updatedAt:order.updatedAt.toISOString(),engineerName:order.engineerProfile.professionalName,deliveryCount:order._count.deliveries }));
  const view = query.view === 'engineers' || query.genre || query.turnaround || query.maxPrice || query.beatPurchaseId ? 'engineers' : query.view === 'projects' ? 'projects' : undefined;
  const content = view === 'engineers' ? <Suspense fallback={<p className={s.notice}>Finding your sound partners…</p>}><HymnStudioEngineers query={query}/></Suspense> : view === 'projects' ? <div><header className={s.heading}><div><p className={s.eyebrow}>Make it sound like you</p><h1>Mixing & mastering</h1><p>Your recordings, conversations, revisions and final masters.</p></div><Link prefetch={false} href="/studio?view=engineers" className={s.primary}>New project ↗</Link></header>{projectResult.error ? <p role="alert" className={s.notice}>Projects could not be loaded. <Link href="/studio?view=projects">Retry</Link></p> : <StudioProjectList projects={projects}/>}<Suspense fallback={<p className={s.notice}>Loading consultations and credits…</p>}><ProjectExtras userId={user.id}/></Suspense></div> : undefined;
  return <CustomerDashboardShell user={user} releases={releases} orders={orders} subscription={subscription} initialBeatPurchases={purchases} producerAccessDisabled={query.producerAccess === 'disabled'} studioContent={content} studioSection={view} studioProjects={projects} studioProjectsError={projectResult.error}/>;
}
