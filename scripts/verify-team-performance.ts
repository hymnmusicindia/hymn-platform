import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { prisma } from '../lib/prisma';
import { buildPerformanceReport, assertPerformanceAccess } from '../lib/team/performance';
import { duePerformanceWindows, reportWindow, indiaDay, dayStart, performanceFeedback } from '../lib/team/performance-model';
import { performanceEmail } from '../lib/team/performance-email';
import { queuePerformanceReports, deliverPerformanceReports } from '../lib/team/performance-outbox';
import { reportReturnPath } from '../lib/routes';
import { GET as cron } from '../app/api/cron/team-performance/route';
import { TeamError } from '../lib/team/policy';

async function main() {
  assert.equal(process.env.DATABASE_URL, 'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const now = new Date('2026-10-22T23:59:10+05:30');
  assert.equal(indiaDay(new Date('2026-10-22T18:30:00Z')), '2026-10-23');
  assert.throws(() => dayStart('2026-02-30'));
  assert.equal(indiaDay(reportWindow('weekly', '2026-10-25').start), '2026-10-19');
  assert.equal(indiaDay(duePerformanceWindows(new Date('2026-10-22T23:58:59+05:30'))[0].start), '2026-10-21');
  assert.equal(indiaDay(duePerformanceWindows(now)[0].start), '2026-10-22');
  assert.equal(indiaDay(duePerformanceWindows(new Date('2026-10-23T00:00:05+05:30'))[0].start), '2026-10-22');
  assert.equal(duePerformanceWindows(new Date('2026-10-26T08:59:59+05:30')).some(w => w.period === 'weekly'), false);
  assert.equal(indiaDay(duePerformanceWindows(new Date('2026-10-26T09:00:00+05:30'))[1].start), '2026-10-19');
  assert.equal(reportReturnPath('/team/performance/123'), '/team/performance/123');
  for (const path of ['//evil.example', '/team/performance/../admin', '/team/performance?next=https://evil.example', 'https://evil.example']) assert.equal(reportReturnPath(path), undefined);
  assert.equal((await cron(new Request('https://fixture.invalid/api/cron/team-performance'))).status, 401);
  const workspace = await prisma.teamWorkspace.create({ data: { name: 'Report fixture' } });
  const staffRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Researcher', permissions: [] } });
  const ownerRole = await prisma.teamRole.create({ data: { workspaceId: workspace.id, name: 'Owner', owner: true, permissions: [] } });
  async function member(name: string, owner = false) {
    const user = await prisma.user.create({ data: { name, email: `${name}@fixture.invalid`, googleId: `performance-${name}` } });
    return prisma.teamMember.create({ data: { workspaceId: workspace.id, userId: user.id, roleId: owner ? ownerRole.id : staffRole.id, joinedAt: new Date('2026-10-01T00:00:00+05:30'), preferences: { crm: { workRole: 'researcher', researchTarget: 3 } } }, include: { role: true } });
  }
  const owner = await member('owner', true), researcher = await member('researcher'), colleague = await member('colleague');
  assertPerformanceAccess(researcher, researcher);
  assertPerformanceAccess(owner, researcher);
  assert.throws(() => assertPerformanceAccess(colleague, researcher), /not available/);
  assert.throws(() => assertPerformanceAccess(owner, { ...researcher, workspaceId: 'another-workspace' }), /not available/);
  async function lead(index: number, when: string, valid = true) {
    const prospect = await prisma.teamProspect.create({ data: { workspaceId: workspace.id, ownerId: researcher.id, name: `Artist ${index}`, email: `artist${index}@fixture.invalid`, verified: valid, contactEligibility: valid ? 'LEGITIMATE_INTEREST' : 'UNVERIFIED', sourceUrl: 'https://fixture.invalid/source', evidence: 'Real fixture source', score: {}, identityKey: `artist-${index}`, followUpAt: new Date('2026-10-22T10:00:00+05:30') } });
    return prisma.acquisitionLead.create({ data: { workspaceId: workspace.id, prospectId: prospect.id, researcherEmployeeId: researcher.id, registeredAt: new Date(when) } });
  }
  const first = await lead(1, '2026-10-22T00:00:00+05:30');
  await lead(2, '2026-10-22T12:00:00+05:30', false);
  await lead(3, '2026-10-21T23:59:59+05:30');
  await lead(4, '2026-10-23T00:00:00+05:30'); // Next India day is excluded.
  for (const [kind, time] of [['CONTACT', '2026-10-22T12:00:00+05:30'], ['CONTACT', '2026-10-22T13:00:00+05:30'], ['DRAFT', '2026-10-22T14:00:00+05:30'], ['REPLY', '2026-10-22T15:00:00+05:30'], ['CONTACT', '2026-10-21T12:00:00+05:30']]) await prisma.teamOutreach.create({ data: { prospectId: first.prospectId, actorId: researcher.id, kind, occurredAt: new Date(time), evidence: 'Fixture event', body: 'Recorded fixture action' } });
  await prisma.teamTask.create({ data: { workspaceId: workspace.id, ownerId: researcher.id, creatorId: owner.id, title: 'Completed evidence-backed task', status: 'COMPLETED', completedAt: new Date('2026-10-22T16:00:00+05:30') } });
  async function commission(amountMinor: number, currency: string, entryType: string, eligibleAt: string) {
    return prisma.acquisitionCommission.create({ data: { leadId: first.id, employeeId: researcher.id, customerId: owner.userId, sourceType: 'distribution', sourceId: 'fixture-sale', paymentId: 'fixture-payment', attributionRole: 'RESEARCHER', eligibleNetRevenueMinor: 10000, rateBps: 1000, amountMinor, currency, calculationBasis: 'Fixture verified payment', paymentVerificationReference: 'fixture-payment', entryType, status: 'PENDING', eligibleAt: new Date(eligibleAt), createdAt: new Date('2026-10-22T17:00:00+05:30') } });
  }
  await commission(1000, 'INR', 'EARNED', '2026-11-01T00:00:00+05:30');
  await commission(-200, 'INR', 'ADJUSTMENT', '2026-10-22T18:00:00+05:30');
  await commission(500, 'USD', 'EARNED', '2026-10-22T18:00:00+05:30');
  const report = await buildPerformanceReport(researcher.id, 'daily', '2026-10-22', now);
  assert.deepEqual(report.metrics, { leads: 2, qualifiedLeads: 1, contacts: 1, contactEvents: 2, replies: 1, conversions: 0, cohortConversions: 0, tasksCompleted: 1 });
  assert.equal(report.previous.leads, 1);
  assert.equal(report.target, 3);
  assert.equal(report.targetActual, 1);
  assert.equal(report.commissions.find(c => c.currency === 'INR')?.netMinor, 800);
  assert.equal(report.commissions.find(c => c.currency === 'INR')?.pendingMinor, 1000);
  assert.equal(report.commissions.find(c => c.currency === 'INR')?.clearedMinor, -200);
  assert.equal(report.commissions.find(c => c.currency === 'USD')?.netMinor, 500);
  assert(report.tips.some(t => t.includes('2 contactable leads below')));
  const weekly = await buildPerformanceReport(researcher.id, 'weekly', '2026-10-22', now);
  assert.equal(weekly.metrics.contacts, 1);
  assert.equal(weekly.days.reduce((sum, d) => sum + d.contacts, 0), 2);
  const neutral = performanceFeedback({ ...report, target: null, workRole: 'team member', metrics: { ...report.metrics, leads: 0, qualifiedLeads: 0 }, overdueFollowUps: 0 });
  assert(!neutral.tips.some(t => t.includes('below the configured target')));
  const email = performanceEmail({ ...report, name: '<script>alert(1)</script>' }, 'https://hymnmusic.fun/team/performance/123');
  assert(!email.html.includes('<script>'));
  assert(email.text.includes('Open detailed performance report'));
  assert(!email.text.includes('DireNote'));
  const callClient = await prisma.teamClient.create({ data: { workspaceId: workspace.id, ownerId: researcher.id, name: 'Agenda artist' } });
  await prisma.teamCalendarEvent.create({ data: { workspaceId: workspace.id, creatorId: owner.id, assigneeId: researcher.id, clientId: callClient.id, title: 'Planned callback', kind: 'FOLLOW_UP', startsAt: new Date(now.getTime() + 86400000) } });
  await queuePerformanceReports(now);
  assert.equal(await prisma.emailLog.count({ where: { template: 'team_performance_report', eventKey: { contains: ':daily:' } } }), 0);
  const before = await prisma.emailLog.count({ where: { template: 'team_performance_report' } });
  await Promise.all([queuePerformanceReports(now), queuePerformanceReports(now)]);
  assert.equal(await prisma.emailLog.count({ where: { template: 'team_performance_report' } }), before);
  assert.equal(await prisma.emailLog.count({ where: { template: 'team_performance_report', entityId: owner.id } }), 0);
  assert.equal((await deliverPerformanceReports(now)).enabled, false);
  const saved = await prisma.emailLog.findFirstOrThrow({ where: { template: 'team_performance_report', entityId: researcher.id, eventKey: { contains: ':weekly:2026-10-12' } } });
  assert.match(String((saved.payload as any).text), /Agenda artist/);
  assert.match(String((saved.payload as any).text), /internal callback/);
  assert.match(String((saved.payload as any).text), /Open your calendar/);
  // Exercise the real saved-report access and download handlers with fixture authentication.
  const require = createRequire(import.meta.url);
  let identity = researcher.userId;
  const compile = (file: string) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const accessModule = { exports: {} as any };
  vm.runInNewContext(compile('lib/team/performance-access.ts'), { exports: accessModule.exports, require: (id: string) => id === 'server-only' ? {} : id === '@/lib/prisma' ? { prisma } : id === './performance' ? { assertPerformanceAccess } : id === './policy' ? { TeamError } : id === './access' ? {
    teamIdentity: async () => { if (!identity) throw new TeamError('Sign in.', 401); },
    teamActor: async (workspaceId: string) => {
      const actor = await prisma.teamMember.findFirst({ where: { userId: identity, workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' } }, include: { role: true } });
      if (!actor) throw new TeamError('Membership required.', 403); return actor;
    }
  } : require(id) });
  const apiModule = { exports: {} as any };
  vm.runInNewContext(compile('app/api/team/performance-report/[id]/route.ts'), { exports: apiModule.exports, Response, require: (id: string) => id === '@/lib/team/performance-access' ? accessModule.exports : id === '@/lib/team/policy' ? { TeamError } : require(id) });
  const download = () => apiModule.exports.GET(new Request('https://fixture.invalid/report'), { params: Promise.resolve({ id: String(saved.id) }) });
  const ownDownload = await download();
  assert.equal(ownDownload.status, 200);
  assert.match(ownDownload.headers.get('cache-control')!, /no-store/);
  assert.match(ownDownload.headers.get('content-disposition')!, /attachment/);
  identity = colleague.userId; assert.equal((await download()).status, 403);
  identity = owner.userId; assert.equal((await download()).status, 200);
  identity = 0; assert.equal((await download()).status, 401);
  await lead(5, '2026-10-22T20:00:00+05:30');
  assert.equal(((await prisma.emailLog.findUniqueOrThrow({ where: { id: saved.id } })).payload as any).report.metrics.leads, 0, 'Saved email snapshot stays unchanged after late data.');
  await prisma.teamMember.update({ where: { id: colleague.id }, data: { status: 'SUSPENDED' } });
  let sends = 0;
  const deliver = async () => { sends++; return { data: { id: 'fixture-message' }, error: null }; };
  const results = await Promise.all([deliverPerformanceReports(now, deliver), deliverPerformanceReports(now, deliver)]);
  assert.equal(sends, 1, 'Only the researcher weekly message sends; concurrent workers claim once and suspended recipients cancel.');
  assert.equal(results.reduce((sum, r) => sum + r.sent, 0), 1);
  await deliverPerformanceReports(now, deliver);
  assert.equal(sends, 1);
  const legacyDaily = await prisma.emailLog.create({ data: { userId: researcher.userId, toEmail: 'researcher@fixture.invalid', subject: 'Legacy daily report', template: 'team_performance_report', eventKey: 'legacy-daily-policy-fixture', entityType: 'team_member', entityId: researcher.id, provider: 'smtp', status: 'pending', payload: { channel: 'team_performance', report: JSON.parse(JSON.stringify(report)), html: 'Old daily report', text: 'Old daily report' } } });
  await deliverPerformanceReports(now, deliver);
  assert.equal(sends, 1, 'A queued legacy daily report must never reach SMTP.');
  assert.equal((await prisma.emailLog.findUniqueOrThrow({ where: { id: legacyDaily.id } })).status, 'cancelled');
  // Uncertain delivery never automatically retries, protecting recipients from duplicates.
  await prisma.emailLog.update({ where: { id: saved.id }, data: { status: 'pending' } });
  await deliverPerformanceReports(now, async () => { throw new Error('Outcome uncertain'); });
  assert.equal((await prisma.emailLog.findUniqueOrThrow({ where: { id: saved.id } })).status, 'review');
  await prisma.emailLog.update({ where: { id: saved.id }, data: { status: 'pending' } });
  const retryAt = new Date(now.getTime() + 3_600_000);
  await deliverPerformanceReports(retryAt, async () => { throw Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' }); });
  const retry = await prisma.emailLog.findUniqueOrThrow({ where: { id: saved.id } });
  assert.equal(retry.status, 'pending');
  assert.equal(retry.retryCount, 2);
  const beforeRetry = sends;
  await deliverPerformanceReports(retryAt, deliver);
  assert.equal(sends, beforeRetry, 'Backoff prevents immediate resend after a known connection failure.');
  console.log('PASS Team performance: daily/weekly analytics, weekly-only email, upcoming calls, legacy daily suppression, attribution, role targets, unique contacts, commission currencies/adjustments/holds, private access, immutable snapshots, disabled SMTP, duplicate claims and suspension cancellation.');
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
