import 'server-only';
import { emailLayout, emailText } from '@/lib/email/email-templates';
import { performanceMoney, type PerformanceReport } from './performance-model';

export function performanceEmail(report: PerformanceReport, reportUrl: string, agenda?: { body: string; url: string }) {
  const label = report.period === 'daily' ? 'Daily' : 'Weekly';
  const range = report.period === 'daily' ? report.startDay : `${report.startDay} – ${report.endDay}`;
  const m = report.metrics;
  const commission = report.commissions.length ? report.commissions.map(c => `${performanceMoney(c.earnedMinor, c.currency)} newly recorded; ${performanceMoney(c.adjustmentMinor, c.currency)} adjustments; ${performanceMoney(c.netMinor, c.currency)} net. Of these entries: ${performanceMoney(c.pendingMinor, c.currency)} on hold, ${performanceMoney(c.clearedMinor, c.currency)} cleared and unallocated, ${performanceMoney(c.reservedMinor, c.currency)} allocated to payout batches.`).join(' ') : 'No commission entries were recorded for this period.';
  const model = {
    title: `Your ${label.toLowerCase()} Team OS report`, greeting: `Hi ${report.name.split(' ')[0]},`,
    body: `${range} · India time. ${m.leads} leads registered, ${m.qualifiedLeads} currently contactable, ${m.contacts} distinct contacts, ${m.replies} replies logged and ${m.tasksCompleted} assignments completed.`,
    ctaLabel: 'Open detailed performance report', ctaUrl: reportUrl,
    notice: `Recorded activity through ${new Date(report.endAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.${report.provisional ? ' This day-end snapshot excludes entries recorded after capture; check the live report for updates.' : ''} Counts describe logged work, not hours worked.`,
    sections: [
      ...(agenda ? [{ title: 'Your calls and callbacks for the next seven days', body: agenda.body + '\nRoutine assignments and reminders appear in Team OS rather than separate emails. Check your calendar for new or changed times.', linkLabel: 'Open your calendar', linkUrl: agenda.url }] : []),
      { title: 'Your target', body: report.target === null ? 'No lead or contact quota is configured for your role. Your completed assignments and recorded activity are shown instead.' : `${report.targetActual} / ${report.target} ${report.targetLabel} (${report.target ? Math.round(report.targetActual / report.target * 100) : 0}%). Targets use your current configured role and calendar-day programme, excluding days before you joined.` },
      { title: 'Compared with the previous period', body: `${report.previousLabel}: ${report.previous.leads} leads, ${report.previous.contacts} distinct contacts and ${report.previous.tasksCompleted} completed assignments. Current period: ${m.conversions} customer conversions across attributed leads; ${m.cohortConversions} of the ${m.leads} leads registered in this period have converted.` },
      { title: report.period === 'daily' ? `Commission recorded on ${report.startDay}` : 'Commission recorded in this period', body: `${commission} These are employee acquisition commissions, not customer royalties. Holds, refund adjustments, reconciliation and payout rules still apply. This is not a bank-payment confirmation.` },
      ...(report.wins.length ? [{ title: 'What went well', body: report.wins.join(' ') }] : []),
      { title: 'Your next actions', body: report.tips.join(' ') },
      { title: 'Current work to review', body: `${report.overdueFollowUps} overdue follow-ups · ${report.overdueTasks} overdue assignments · ${report.blockedTasks} blocked assignments · ${report.openAssignments} open assignments. Queue counts and lead eligibility reflect records at capture time. Corrections and late entries may change the live report.` }
    ]
  };
  return { subject: `HYMN Team OS · ${label} performance · ${range}`, html: emailLayout(model), text: emailText(model) };
}
