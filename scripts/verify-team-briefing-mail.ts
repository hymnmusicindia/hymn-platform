import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { PDFDocument } from 'pdf-lib';

async function main() {
  mkdirSync('.cache', { recursive: true });
  const output = resolve('.cache/team-briefing-test.cjs');
  (globalThis as any).__briefingEnabled = true;
  await build({ entryPoints: ['lib/team/briefing-outbox.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'isolated-briefing', setup(builder) {
    builder.onResolve({ filter: /^(server-only|@\/lib\/prisma|@\/lib\/email\/email-client)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'server-only' ? '' : args.path.endsWith('/prisma') ? 'export const prisma={};' : "export const getEmailConfig=()=>({enabled:globalThis.__briefingEnabled,from:'HYMN <test@fixture.invalid>'});export const getEmailClient=()=>{throw Error('Real SMTP prohibited in tests')};", loader: 'js' }));
  } }] });
  const { briefingAttachment, deliverTeamBriefings, queueTeamBriefing } = createRequire(import.meta.url)(output);
  const pdf = await PDFDocument.create(); pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  const payload = { channel: 'team_briefing', workspaceId: 'workspace', memberId: 'member', actorId: 'owner', html: '<p>Instructions</p>', text: 'Instructions', filename: 'HYMN_brief.pdf', pdfBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.deepEqual((await briefingAttachment(payload)).content, bytes);
  await assert.rejects(briefingAttachment({ ...payload, sha256: '0'.repeat(64) }));
  await assert.rejects(briefingAttachment({ ...payload, filename: '../secret.pdf' }));
  await assert.rejects(briefingAttachment({ ...payload, pdfBase64: Buffer.from('%PDF-not-a-document').toString('base64') }));
  const rows: any[] = [];
  let memberActive = true, ownerActive = true, assigned = true, sends = 0;
  const matches = (row: any, w: any) => (!w.id || row.id === w.id) && (!w.eventKey || row.eventKey === w.eventKey) && (!w.status || row.status === w.status) && (!w.template || row.template === w.template) && (!w.payload || row.payload.channel === w.payload.equals);
  const db: any = {
    emailLog: {
      findMany: async ({ where }: any) => rows.filter(r => matches(r, where)).map(r => ({ ...r })),
      findUnique: async ({ where }: any) => rows.find(r => matches(r, where)) || null,
      create: async ({ data }: any) => { const row = { id: rows.length + 1, retryCount: 0, ...data }; rows.push(row); return row; },
      updateMany: async ({ where, data }: any) => { let count = 0; for (const row of rows) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
      update: async ({ where, data }: any) => { const row = rows.find(r => matches(r, where)); assert.ok(row); Object.assign(row, data); return row; }
    },
    teamMember: { findFirst: async ({ where }: any) => where.role ? ownerActive ? { id: 'owner' } : null : memberActive ? { id: 'member', user: { id: 65, email: 'kira@fixture.invalid' } } : null },
    teamTask: { findFirst: async () => assigned ? { id: 'task' } : null },
    teamAudit: { create: async () => ({}) },
    $transaction: async (fn: any) => fn(db)
  };
  const input = { workspaceId: 'workspace', actorId: 'owner', memberId: 'member', taskId: 'task', eventKey: 'briefing:test:1', subject: 'Your guide', html: payload.html, text: payload.text, filename: payload.filename, pdf: bytes };
  const row = await queueTeamBriefing(input, db);
  assert.equal((await queueTeamBriefing(input, db)).id, row.id);
  assert.equal(rows.length, 1, 'Queue replay does not duplicate the message.');
  await assert.rejects(queueTeamBriefing({ ...input, text: 'Changed' }, db));
  const deliver = async (message: any) => { sends++; assert.equal(message.to, 'kira@fixture.invalid'); assert.deepEqual(message.attachments[0].content, bytes); return { data: { id: 'smtp-fixture-' + sends }, error: null }; };
  await Promise.all([deliverTeamBriefings(row.id, deliver, db), deliverTeamBriefings(row.id, deliver, db)]);
  assert.equal(sends, 1, 'Concurrent worker claims send only once.');
  assert.equal(row.status, 'sent');
  await deliverTeamBriefings(row.id, deliver, db); assert.equal(sends, 1);
  const fresh = () => { const r = { ...rows[0], id: rows.length + 1, status: 'pending', payload: { ...payload }, retryCount: 0 }; rows.push(r); return r; };
  let next = fresh(); memberActive = false;
  await deliverTeamBriefings(next.id, deliver, db); assert.equal(next.status, 'cancelled'); memberActive = true;
  next = fresh(); ownerActive = false;
  await deliverTeamBriefings(next.id, deliver, db); assert.equal(next.status, 'cancelled'); ownerActive = true;
  next = fresh(); assigned = false;
  await deliverTeamBriefings(next.id, deliver, db); assert.equal(next.status, 'cancelled'); assigned = true;
  next = fresh(); next.payload.sha256 = '0'.repeat(64);
  await deliverTeamBriefings(next.id, deliver, db); assert.equal(next.status, 'cancelled');
  next = fresh();
  await deliverTeamBriefings(next.id, async () => { throw Object.assign(Error('Socket timed out after DATA'), { code: 'ETIMEDOUT', command: 'DATA' }); }, db);
  assert.equal(next.status, 'review', 'Uncertain acceptance never automatically retries.');
  next = fresh();
  await deliverTeamBriefings(next.id, async () => { throw Object.assign(Error('Connection refused'), { code: 'ECONNREFUSED' }); }, db);
  assert.equal(next.status, 'pending'); assert.equal(next.retryCount, 1);
  await deliverTeamBriefings(next.id, deliver, db); assert.equal(sends, 1, 'Connection backoff is honoured.');
  next = fresh(); next.status = 'sending'; next.payload.claimedAt = new Date(0).toISOString();
  await deliverTeamBriefings(next.id, deliver, db); assert.equal(next.status, 'review');
  next = fresh(); (globalThis as any).__briefingEnabled = false;
  assert.equal((await deliverTeamBriefings(next.id, undefined, db)).enabled, false); assert.equal(next.status, 'pending');
  console.log('PASS private PDF integrity, owner/member/task checks, idempotency, concurrent claims, SMTP acceptance, cancellation, uncertain-send review, bounded retry, backoff and disabled mail. No real mail or database used.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
