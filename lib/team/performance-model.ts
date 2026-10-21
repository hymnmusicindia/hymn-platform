export type PerformancePeriod = 'daily' | 'weekly';
export const INDIA_OFFSET = 330 * 60_000;
export const DAY_MS = 86_400_000;
export function indiaDay(now = new Date()) { return new Date(now.getTime() + INDIA_OFFSET).toISOString().slice(0, 10); }
export function dayStart(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose a valid report date.');
  const date = new Date(`${day}T00:00:00+05:30`);
  if (!Number.isFinite(date.getTime()) || indiaDay(date) !== day) throw new Error('Choose a valid report date.');
  return date;
}
export function reportWindow(period: PerformancePeriod, day: string) {
  let start = dayStart(day);
  if (period === 'weekly') {
    const weekday = new Date(start.getTime() + INDIA_OFFSET).getUTCDay();
    start = new Date(start.getTime() - ((weekday + 6) % 7) * DAY_MS);
  }
  return { period, start, end: new Date(start.getTime() + (period === 'daily' ? 1 : 7) * DAY_MS) };
}
export function duePerformanceWindows(now = new Date()) {
  const local = new Date(now.getTime() + INDIA_OFFSET);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const today = dayStart(indiaDay(now));
  // The latest due day also catches a missed run without sending a historical backlog.
  const daily = reportWindow('daily', indiaDay(new Date(today.getTime() - (minute >= 1439 ? 0 : DAY_MS))));
  const thisWeek = reportWindow('weekly', indiaDay(now));
  const weekly = reportWindow('weekly', indiaDay(new Date(thisWeek.start.getTime() - DAY_MS)));
  return [daily, ...(now.getTime() >= weekly.end.getTime() + 9 * 3_600_000 ? [weekly] : [])];
}
export type PerformanceMetrics = { leads: number; qualifiedLeads: number; contacts: number; contactEvents: number; replies: number; conversions: number; cohortConversions: number; tasksCompleted: number };
export type PerformanceReport = {
  version: 1; workspaceId: string; memberId: string; userId: number; name: string; jobTitle: string;
  workRole: string; period: PerformancePeriod; startDay: string; endDay: string; startAt: string; endAt: string;
  generatedAt: string; provisional: boolean; target: number | null; targetActual: number; targetLabel: string;
  metrics: PerformanceMetrics; previous: PerformanceMetrics; previousLabel: string;
  overdueFollowUps: number; overdueTasks: number; blockedTasks: number; openAssignments: number;
  commissions: { currency: string; earnedMinor: number; adjustmentMinor: number; netMinor: number; pendingMinor: number; clearedMinor: number; reservedMinor: number }[];
  days: { day: string; leads: number; qualifiedLeads: number; contacts: number; tasksCompleted: number }[];
  tips: string[]; wins: string[];
};
export function performanceFeedback(r: Pick<PerformanceReport, 'target' | 'targetActual' | 'targetLabel' | 'metrics' | 'overdueFollowUps' | 'overdueTasks' | 'blockedTasks' | 'workRole'>) {
  const tips: string[] = [], wins: string[] = [];
  if (r.target !== null) {
    if (r.targetActual >= r.target) wins.push(`You met the recorded ${r.targetLabel} target: ${r.targetActual} / ${r.target}.`);
    else tips.push(`${r.target - r.targetActual} ${r.targetLabel} below the configured target. Plan focused work blocks and record the evidence for work you complete.`);
  }
  if (r.metrics.leads > r.metrics.qualifiedLeads) tips.push(`${r.metrics.leads - r.metrics.qualifiedLeads} registered leads do not currently meet contactable-lead criteria. Check the source, contact details and outreach eligibility; respect opt-outs.`);
  if (r.overdueFollowUps) tips.push(`Review ${r.overdueFollowUps} overdue follow-ups first. Record the outcome and schedule a clear next step.`);
  if (r.blockedTasks) tips.push(`Share the dependency and help needed for ${r.blockedTasks} blocked assignments with your manager.`);
  if (r.overdueTasks) tips.push(`Review ${r.overdueTasks} overdue assignments and agree realistic next actions.`);
  if (r.metrics.contacts && !r.metrics.replies) tips.push('Contact attempts are recorded, but no replies were logged in this period. Review your introduction and service fit, and log any real replies. Replies may arrive later.');
  if (r.metrics.tasksCompleted) wins.push(`${r.metrics.tasksCompleted} assignments completed in the recorded period.`);
  if (r.metrics.conversions) wins.push(`${r.metrics.conversions} attributed customer conversions recorded.`);
  if (!Object.values(r.metrics).some(Boolean)) tips.push('No tracked activity was found for this period. Confirm that completed work is logged; this is not a measure of hours worked or effort.');
  if (!tips.length) tips.push(r.workRole === 'researcher' ? 'Keep prioritising source-backed, relevant contacts and complete handoff notes.' : r.workRole === 'caller' ? 'Keep your follow-up queue current and record outcomes, objections and the next step.' : 'Keep assignment evidence current and agree the next priorities with your manager.');
  return { tips: tips.slice(0, 6), wins };
}
export function performanceMoney(minor: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(minor / 100);
}
