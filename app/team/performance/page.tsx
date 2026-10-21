import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { teamActor } from '@/lib/team/access';
import { can, TeamError } from '@/lib/team/policy';
import { assertPerformanceAccess, buildPerformanceReport } from '@/lib/team/performance';
import { indiaDay, dayStart } from '@/lib/team/performance-model';
import { TeamPerformanceReport } from '@/components/team/performance-report';
import styles from '@/components/team/performance-report.module.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Performance · HYMN Team OS', robots: { index: false, follow: false } };
type ReportParams = { workspace?: string; member?: string; period?: string; date?: string };
async function loadReport(params: ReportParams) {
  try {
    const actor = await teamActor(params.workspace);
    const memberId = params.member || actor.id;
    assertPerformanceAccess(actor, { id: memberId, workspaceId: actor.workspaceId });
    const member = await prisma.teamMember.findFirst({ where: { id: memberId, workspaceId: actor.workspaceId } });
    if (!member) notFound();
    const period = params.period === 'weekly' ? 'weekly' : 'daily';
    const day = params.date || indiaDay();
    try { dayStart(day); } catch { notFound(); }
    const report = await buildPerformanceReport(member.id, period, day);
    const [members, archive] = await Promise.all([
      can(actor, 'reports.all.view') ? prisma.teamMember.findMany({ where: { workspaceId: actor.workspaceId, status: 'ACTIVE', role: { owner: false } }, select: { id: true, user: { select: { name: true } } }, orderBy: { joinedAt: 'asc' } }) : Promise.resolve([]),
      prisma.emailLog.findMany({ where: { template: 'team_performance_report', entityType: 'team_member', entityId: member.id }, select: { id: true, subject: true }, orderBy: { createdAt: 'desc' }, take: 14 })
    ]);
    return { actor, member, report, members, archive, period, day };
  } catch (error) { if (error instanceof TeamError || error instanceof Error && error.message === 'Future performance reports are not available.') notFound(); throw error; }
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<ReportParams> }) {
  if (!await getSession()) redirect("/login?next=/team/performance");
  const { actor, member, report, members, archive, period, day } = await loadReport(await searchParams);
  return <TeamPerformanceReport report={report}><form className={styles.filters} method="get"><input type="hidden" name="workspace" value={actor.workspaceId}/>{members.length ? <label>Team member<select name="member" defaultValue={member.id}><option value={actor.id}>My report</option>{members.map(m => <option key={m.id} value={m.id}>{m.user.name}</option>)}</select></label> : null}<label>Period<select name="period" defaultValue={period}><option value="daily">Daily</option><option value="weekly">Weekly · Monday to Sunday</option></select></label><label>India date<input name="date" type="date" defaultValue={day} max={indiaDay()} required/></label><button type="submit">View report</button></form>{archive.length ? <details className={styles.card}><summary>Saved email reports</summary><div className={styles.archive}>{archive.map(row => <Link key={row.id} href={`/team/performance/${row.id}`}>{row.subject}</Link>)}</div></details> : null}</TeamPerformanceReport>;
}
