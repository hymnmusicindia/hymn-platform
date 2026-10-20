import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { policyDocuments, POLICY_VERSION, POLICY_UPDATED_LABEL, DISTRIBUTION_POLICY_SUMMARY } from '@/lib/policy-content';

const documents = JSON.stringify(policyDocuments);
export const CURRENT_POLICY_REVISION = createHash('sha256').update(JSON.stringify({ version: POLICY_VERSION, documents: policyDocuments })).digest('hex');
const acceptanceWhere = (userId: number) => ({ actorId: userId, action: 'ACCOUNT_POLICIES_ACCEPTED', entity: 'account_policy_acceptance', entityId: CURRENT_POLICY_REVISION });
export type PolicyAgreementStatus = { revision: string; version: string; updatedLabel: string; distributionSummary: string; accepted: boolean; acceptedAt: string | null };
export const policyRevision = { revision: CURRENT_POLICY_REVISION, version: POLICY_VERSION, updatedLabel: POLICY_UPDATED_LABEL, distributionSummary: DISTRIBUTION_POLICY_SUMMARY };

export async function getPolicyAgreementStatus(userId: number): Promise<PolicyAgreementStatus> {
  const accepted = await prisma.auditLog.findFirst({ where: acceptanceWhere(userId), orderBy: { id: 'desc' }, select: { createdAt: true } });
  return { ...policyRevision, accepted: Boolean(accepted), acceptedAt: accepted?.createdAt.toISOString() ?? null };
}

/** Immutable snapshots and explicit user acceptance use the existing indexed audit ledger. */
export async function acceptCurrentPolicies(userId: number, revision: string) {
  if (revision !== CURRENT_POLICY_REVISION) return { stale: true as const, status: await getPolicyAgreementStatus(userId) };
  await prisma.$transaction(async tx => {
    let publication = await tx.auditLog.findFirst({ where: { action: 'ACCOUNT_POLICY_REVISION_PUBLISHED', entity: 'account_policy_revision', entityId: CURRENT_POLICY_REVISION }, select: { id: true } });
    if (!publication) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422042, 0)`;
      publication = await tx.auditLog.findFirst({ where: { action: 'ACCOUNT_POLICY_REVISION_PUBLISHED', entity: 'account_policy_revision', entityId: CURRENT_POLICY_REVISION }, select: { id: true } });
      if (!publication) publication = await tx.auditLog.create({ data: { actorType: 'system', action: 'ACCOUNT_POLICY_REVISION_PUBLISHED', entity: 'account_policy_revision', entityId: CURRENT_POLICY_REVISION, metadata: { ...policyRevision, documents: JSON.parse(documents) } }, select: { id: true } });
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422043, ${userId}::integer)`;
    const existing = await tx.auditLog.findFirst({ where: acceptanceWhere(userId), select: { id: true } });
    if (!existing) await tx.auditLog.create({ data: { actorId: userId, actorType: 'user', action: 'ACCOUNT_POLICIES_ACCEPTED', entity: 'account_policy_acceptance', entityId: CURRENT_POLICY_REVISION, metadata: { ...policyRevision, publicationId: publication.id, method: 'explicit_agree_button', privacyNoticeAcknowledged: true, optionalMarketingConsent: false } } });
  });
  return { stale: false as const, status: await getPolicyAgreementStatus(userId) };
}

export async function requireCurrentPolicyAcceptance(userId: number) {
  const status = await getPolicyAgreementStatus(userId);
  return status.accepted ? null : NextResponse.json({ error: 'Review and accept the current Terms and policies using the banner at the top of your account before continuing.', code: 'POLICY_ACCEPTANCE_REQUIRED', policy: status }, { status: 428, headers: { 'Cache-Control': 'no-store' } });
}
