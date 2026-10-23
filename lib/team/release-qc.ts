import 'server-only';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { updateDetailedReleaseStatus } from '@/lib/distribution-db';
import { submitRelease } from '@/lib/distribution-service';
import { getPublicAppUrl } from '@/lib/public-app-url';
import { resolvePrivateReleaseArtworkUrl } from '@/lib/release-asset-resolution';
import { customerBrandText } from '@/lib/customer-message';
import { createAdminTaskOnce } from '@/lib/task-queue';
import { can, demand, TeamError, type Actor } from './policy';
import { teamWrite } from './service';

export const QC_PERMISSION = 'operations.distribution.qc' as const;
export const QC_PENDING = ['SUBMITTED', 'UNDER_REVIEW', 'IN_QC_QUEUE', 'RESUBMITTED'] as const;
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const active = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED'];
export const qcDecisionSchema = z.object({ taskId: z.string().min(1).max(80), taskVersion: z.number().int().positive(), releaseVersion: z.number().int().positive(), decision: z.enum(['approved', 'changes_requested', 'rejected']), note: z.string().trim().min(5).max(3000), issueType: z.enum(['metadata', 'artwork', 'audio', 'rights_ownership', 'contributor_credits', 'release_date', 'genre_language', 'artist_profile', 'license_ai_proof', 'platform_destination', 'other']).default('other'), fields: z.array(z.object({ field: z.string().trim().min(1).max(100), label: z.string().trim().min(1).max(150), note: z.string().trim().max(500).optional() })).max(30).default([]), checklistConfirmed: z.literal(true) }).superRefine((v, ctx) => { if (v.decision !== 'approved' && v.issueType === 'metadata' && !v.fields.length) ctx.addIssue({ code: 'custom', path: ['fields'], message: 'Identify the metadata fields requiring correction.' }); });

/** Called within the workspace lock. Titles never grant business permissions. */
export async function syncReleaseQcAssignments(tx: Prisma.TransactionClient, a: Actor) {
  if (!a.role.owner) throw new TeamError('Workspace owner required.', 403);
  const primary = await tx.teamWorkspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (primary?.id !== a.workspaceId) return { created: 0 };
  const reviewers = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', availability: 'AVAILABLE', role: { owner: false, permissions: { has: QC_PERMISSION } }, user: { status: 'ACTIVE' } }, orderBy: { id: 'asc' } });
  if (!reviewers.length) return { created: 0 };
  const authorised = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: 'ACTIVE', role: { permissions: { has: QC_PERMISSION } }, user: { status: 'ACTIVE' } }, select: { id: true } });
  const open = await tx.teamTask.findMany({ where: { workspaceId: a.workspaceId, archivedAt: null, eventKey: { startsWith: 'release-qc:' }, status: { in: active } } });
  const linked = await tx.release.findMany({ where: { id: { in: open.flatMap(t => t.recordId ? [t.recordId] : []) } }, select: { id: true, status: true, archivedAt: true } });
  const tasks = [] as typeof open;
  for (const task of open) {
    const release = linked.find(r => r.id === task.recordId);
    if (release && !release.archivedAt && QC_PENDING.includes(release.status as typeof QC_PENDING[number])) { tasks.push(task); continue; }
    await tx.teamTask.update({ where: { id: task.id }, data: { status: 'CANCELLED', blocker: 'The release left the QC queue through another authorised workflow.', version: { increment: 1 } } });
    await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'release.qc_superseded', entityId: task.id, detail: { releaseId: task.recordId, releaseStatus: release?.status ?? 'unavailable' } } });
  }
  const load = new Map(reviewers.map(r => [r.id, tasks.filter(t => t.ownerId === r.id).length]));
  const last = await tx.teamTask.findFirst({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: 'release-qc:' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { ownerId: true } });
  const next = (reviewers.findIndex(r => r.id === last?.ownerId) + 1) % reviewers.length;
  const rotation = [...reviewers.slice(next), ...reviewers.slice(0, next)];
  const retained = tasks.filter(t => authorised.some(m => m.id === t.ownerId)).flatMap(t => t.recordId ? [t.recordId] : []);
  const releases = await tx.release.findMany({ where: { id: { notIn: retained }, archivedAt: null, status: { in: [...QC_PENDING] } }, select: { id: true, title: true, userId: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50 });
  let created = 0;
  for (const release of releases) {
    const existing = tasks.find(t => t.recordId === release.id);
    if (existing && authorised.some(m => m.id === existing.ownerId)) continue;
    // A creator never reviews their own release, even if assigned QC authority.
    const candidates = rotation.filter(r => r.userId !== release.userId).sort((l, r) => (load.get(l.id) || 0) - (load.get(r.id) || 0));
    if (!candidates.length) continue;
    const owner = candidates[0];
    if (existing) {
      await tx.teamTask.update({ where: { id: existing.id }, data: { ownerId: owner.id, status: 'TODO', version: { increment: 1 } } });
      await tx.teamNotification.create({ data: { memberId: owner.id, title: `QC reassigned: ${release.title}`, href: `/team?workspace=${a.workspaceId}&module=release-qc&task=${existing.id}` } });
      await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'release.qc_reassigned', entityId: existing.id, detail: { previousOwnerId: existing.ownerId, ownerId: owner.id } } });
      load.set(owner.id, (load.get(owner.id) || 0) + 1); continue;
    }
    const round = await tx.teamTask.count({ where: { workspaceId: a.workspaceId, eventKey: { startsWith: `release-qc:${a.workspaceId}:${release.id}:` } } }) + 1;
    const task = await tx.teamTask.create({ data: { workspaceId: a.workspaceId, creatorId: a.id, ownerId: owner.id, recordType: 'release', recordId: release.id, eventKey: `release-qc:${a.workspaceId}:${release.id}:${round}`, title: `QC: ${release.title}`.slice(0, 200), description: 'Review the full audio, cover artwork, metadata, artist profiles, credits, rights/licences and destinations. Open Release QC to record the decision. Approval queues the existing HYMN delivery workflow; task completion alone cannot approve a release.', approvalRequired: true, priority: 'HIGH', followUpContext: json({ kind: 'RELEASE_QC', round }), checklist: [{ text: 'Audio, artwork, metadata, artists, credits, rights and destinations reviewed', done: false }] } });
    await tx.teamNotification.create({ data: { memberId: owner.id, title: task.title, href: `/team?workspace=${a.workspaceId}&module=release-qc&task=${task.id}` } });
    await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'release.qc_assigned', entityId: task.id, detail: { releaseId: release.id, ownerId: owner.id, round } } });
    load.set(owner.id, (load.get(owner.id) || 0) + 1); created++;
  }
  return { created };
}

export async function readAssignedReleaseQc(a: Actor, taskId?: string) {
  demand(a, QC_PERMISSION);
  const where = { workspaceId: a.workspaceId, eventKey: { startsWith: 'release-qc:' }, archivedAt: null, ...(a.role.owner ? {} : { ownerId: a.id }) };
  if (!taskId) return { items: await prisma.teamTask.findMany({ where, select: { id: true, title: true, status: true, version: true, recordId: true, owner: { select: { user: { select: { name: true } } } }, followUpContext: true }, orderBy: [{ createdAt: 'desc' }], take: 100 }) };
  const task = await prisma.teamTask.findFirst({ where: { ...where, id: taskId } });
  if (!task?.recordId) throw new TeamError('Assigned QC task unavailable.', 404);
  const release = await prisma.release.findUniqueOrThrow({ where: { id: task.recordId }, select: { id: true, title: true, artistName: true, version: true, status: true, genre: true, releaseDate: true, upc: true, artworkUrl: true, userId: true, metadata: true, tracks: { orderBy: { trackNumber: 'asc' }, select: { id: true, title: true, primaryArtist: true, isrc: true, audioUrl: true, duration: true, metadata: true } } } });
  if (!a.role.owner && release.userId === a.userId) throw new TeamError('You cannot QC your own release.', 403);
  const assets = await prisma.storedAsset.findMany({ where: { ownerUserId: release.userId, deletedAt: null, uploadStatus: 'ready', OR: [{ releaseId: release.id }, { releaseAssetLinks: { some: { releaseId: release.id } } }], assetType: { in: ['private_audio_master', 'private_unreleased_artwork', 'private_ownership_proof', 'private_cover_licence', 'private_ai_receipt'] } }, select: { id: true, originalFilename: true, assetType: true, mimeType: true } });
  const artworkUrl = await resolvePrivateReleaseArtworkUrl({ userId: release.userId, releaseId: release.id, value: release.artworkUrl });
  // Internal review needs the submitted fields, but no partner diagnostics or tokens.
  const metadata = object(release.metadata);
  for (const key of Object.keys(metadata)) if (/direnote|provider|token|secret|payment|checkout|razorpay/i.test(key)) delete metadata[key];
  return { task, release: { ...release, language: String(metadata.language || metadata.releaseLanguage || "Not supplied"), artworkUrl, metadata }, assets };
}

export async function reviewAssignedReleaseQc(a: Actor, raw: unknown) {
  demand(a, QC_PERMISSION);
  const input = qcDecisionSchema.parse(raw);
  const task = await prisma.teamTask.findFirst({ where: { id: input.taskId, workspaceId: a.workspaceId, ownerId: a.id, archivedAt: null, eventKey: { startsWith: 'release-qc:' }, recordType: 'release', status: { in: active } } });
  if (!task?.recordId) throw new TeamError('An open QC task must be assigned to you.', 403);
  let expectedVersion = input.releaseVersion;
  const verify = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${a.workspaceId} FOR UPDATE`;
    const member = await tx.teamMember.findFirst({ where: { id: a.id, workspaceId: a.workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' } }, include: { role: true } });
    if (!member || !can(member, QC_PERMISSION)) throw new TeamError('QC access was revoked.', 403);
    const currentTask = await tx.teamTask.findFirst({ where: { id: task.id, workspaceId: a.workspaceId, ownerId: a.id, archivedAt: null, version: input.taskVersion, status: { in: active } } });
    const current = await tx.release.findUniqueOrThrow({ where: { id: task.recordId! }, select: { version: true, status: true, userId: true, archivedAt: true } });
    if (!currentTask || current.archivedAt || current.version !== expectedVersion || !QC_PENDING.includes(current.status as typeof QC_PENDING[number])) throw new TeamError('Release or assignment changed. Refresh before reviewing.', 409);
    if (current.userId === member.userId) throw new TeamError('You cannot QC your own release.', 403);
  };
  const before = await prisma.release.findUniqueOrThrow({ where: { id: task.recordId }, select: { status: true } });
  if (before.status !== 'UNDER_REVIEW') {
    await updateDetailedReleaseStatus(task.recordId, 'under_review', 'Assigned QC review started.', undefined, { actorType: 'team_member', actorId: a.userId, persist: verify });
    expectedVersion++;
  }
  const note = customerBrandText(input.note);
  const release = await updateDetailedReleaseStatus(task.recordId, input.decision, note, input.decision === 'approved' ? undefined : { reason: note, issueType: input.issueType, severity: 'required_correction', fields: input.fields.map(f => ({ ...f, label: customerBrandText(f.label), ...(f.note ? { note: customerBrandText(f.note) } : {}) })), reviewedBy: String(a.userId) }, { actorType: 'team_member', actorId: a.userId, persist: async tx => {
    await verify(tx);
    const context = { ...object(task.followUpContext), decision: input.decision, reviewerId: a.id, reviewedAt: new Date().toISOString(), reviewedReleaseVersion: expectedVersion + 1, delivery: input.decision === 'approved' ? 'pending' : 'not_required' };
    await tx.teamTask.update({ where: { id: task.id }, data: { status: 'COMPLETED', completedAt: new Date(), evidence: note, checklist: [{ text: 'Audio, artwork, metadata, artists, credits, rights and destinations reviewed', done: true }], followUpContext: json(context), version: { increment: 1 } } });
    await tx.teamAudit.create({ data: { workspaceId: a.workspaceId, actorId: a.id, action: 'release.qc_decided', entityId: task.id, detail: { releaseId: task.recordId, decision: input.decision, releaseVersion: expectedVersion, note } } });
  } });
  return { taskId: task.id, status: input.decision, releaseId: release?.id, message: input.decision === 'approved' ? 'QC approved. HYMN delivery is queued and will continue automatically.' : 'QC decision saved. The customer correction/review workflow has been notified.' };
}

export async function deliverApprovedReleaseQc(limit = 2, taskId?: string, submit = submitRelease) {
  const jobs = await prisma.teamTask.findMany({ where: { ...(taskId ? { id: taskId } : {}), eventKey: { startsWith: 'release-qc:' }, status: 'COMPLETED', followUpContext: { path: ['delivery'], equals: 'pending' } }, orderBy: { completedAt: 'asc' }, take: limit });
  let sent = 0, review = 0;
  const deadline = Date.now() + 220000;
  for (const task of jobs) {
    if (Date.now() + 180000 > deadline) break;
    const context = object(task.followUpContext);
    if (!(await prisma.teamTask.updateMany({ where: { id: task.id, version: task.version, followUpContext: { path: ['delivery'], equals: 'pending' } }, data: { followUpContext: json({ ...context, delivery: 'sending', claimedAt: new Date().toISOString() }), version: { increment: 1 } } })).count) continue;
    let outcome = 'review'; let message = 'Delivery requires operational review.';
    try {
      const member = await prisma.teamMember.findFirst({ where: { id: task.ownerId, workspaceId: task.workspaceId, status: 'ACTIVE', user: { status: 'ACTIVE' }, role: { permissions: { has: QC_PERMISSION } } } });
      const release = task.recordId ? await prisma.release.findUnique({ where: { id: task.recordId }, select: { status: true, version: true, userId: true } }) : null;
      if (!member || !release || context.kind !== 'RELEASE_QC' || context.decision !== 'approved' || context.reviewerId !== member.id || release.userId === member.userId || release.status !== 'APPROVED' || release.version !== context.reviewedReleaseVersion) throw Error('Approval, assignment or release changed before delivery.');
      const result = await submit(task.recordId!, { actorId: member.userId, siteUrl: getPublicAppUrl() });
      if (result.submitted) { outcome = 'sent'; message = 'HYMN distribution accepted the approved release.'; sent++; }
      else if ('inProgress' in result && result.inProgress) { outcome = 'pending'; message = 'Existing distribution work is still processing.'; }
      else message = customerBrandText(result.error || result.validation.issues.map(i => i.message).join(' ') || message);
    } catch (error) { message = customerBrandText(error instanceof Error ? error.message : message); }
    if (outcome === 'review') review++;
    await prisma.teamTask.update({ where: { id: task.id }, data: { followUpContext: json({ ...context, delivery: outcome, deliveryMessage: message, deliveryUpdatedAt: new Date().toISOString() }), version: { increment: 1 } } });
    await prisma.teamNotification.create({ data: { memberId: task.ownerId, title: outcome === 'sent' ? 'QC approved: release sent for distribution' : outcome === 'review' ? 'QC approved: delivery needs attention' : 'QC delivery is processing', href: `/team?workspace=${task.workspaceId}&module=release-qc&task=${task.id}` } });
  }
  // A crashed sender is never blindly replayed. Existing provider-attempt evidence
  // remains authoritative and can be reconciled by the distribution operator.
  const interrupted = await prisma.teamTask.findMany({ where: { eventKey: { startsWith: 'release-qc:' }, followUpContext: { path: ['delivery'], equals: 'sending' }, updatedAt: { lt: new Date(Date.now() - 10 * 60000) } }, take: 20 });
  for (const task of interrupted) await prisma.teamTask.updateMany({ where: { id: task.id, version: task.version }, data: { followUpContext: json({ ...object(task.followUpContext), delivery: 'review', deliveryMessage: 'Interrupted delivery. Verify the saved distribution attempt before any resend.' }), version: { increment: 1 } } });
  const attention = await prisma.teamTask.findMany({ where: { eventKey: { startsWith: 'release-qc:' }, followUpContext: { path: ['delivery'], equals: 'review' } }, take: 20 });
  for (const task of attention) await createAdminTaskOnce({ eventKey: `${task.id}:qc-delivery-review`, type: 'distribution_delivery_review', priority: 'high', title: `QC delivery needs attention: release #${task.recordId}`, body: String(object(task.followUpContext).deliveryMessage || 'Verify the saved partner attempt before resending.'), href: `/admin?tab=releases&releaseId=${task.recordId}`, entityType: 'release', entityId: task.recordId || 0 });
  return { sent, review, failed: review };
}

export async function syncReleaseQcWork() {
  const workspace = await prisma.teamWorkspace.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  const owner = workspace && await prisma.teamMember.findFirst({ where: { workspaceId: workspace.id, status: 'ACTIVE', role: { owner: true }, user: { status: 'ACTIVE' } }, include: { role: true } });
  if (!owner) return { created: 0 };
  return teamWrite(owner, (tx, actor) => syncReleaseQcAssignments(tx, actor));
}
