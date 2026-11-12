import 'server-only';
import { prisma } from '../prisma';
import { localPrivateStorage } from '../private-storage';
import { hubNotice } from '../artist-hub';

const documentTypes = ['government_id', 'passport', 'driving_licence', 'business_registration'];
export async function payoutVerification(userId: number) {
  const row = await prisma.payoutVerification.findUnique({ where: { userId } });
  if (!row) return { status: 'not_started', documentType: 'government_id', identityAssetId: null, beneficiaryAssetId: null, checks: null };
  return { status: row.status, documentType: row.documentType, identityAssetId: row.identityAssetId, beneficiaryAssetId: row.beneficiaryAssetId, checks: row.checks };
}
async function validateEvidence(userId: number, id: number) {
  const asset = await prisma.storedAsset.findFirst({ where: { id, ownerUserId: userId, assetType: 'private_kyc_document', deletedAt: null } });
  if (!asset) throw Error('Choose a private verification document uploaded by your account.');
  if (asset.byteSize > 10 * 1024 * 1024) throw Error('Use a document up to 10 MB.');
  const file = await localPrivateStorage.createAuthorizedRead({ assetId: id, requesterUserId: userId, isAdmin: false });
  if (file.mimeType.startsWith('image/')) {
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(file.bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) < 800 || Math.min(metadata.width, metadata.height) < 450) throw Error('Retake the document photo at a higher resolution (at least 800 × 450 pixels).');
  } else if (file.mimeType === 'application/pdf') {
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(file.bytes);
    if (pdf.getPageCount() < 1 || pdf.getPageCount() > 10) throw Error('Use a document with one to ten pages.');
  } else throw Error('Use a JPG, PNG or PDF document.');
  return { id: asset.id, checksum: asset.checksum };
}
export async function savePayoutVerification(userId: number, input: { documentType: string; identityAssetId?: number | null; beneficiaryAssetId?: number | null; submit: boolean; consent: boolean }) {
  if (!documentTypes.includes(input.documentType)) throw Error('Choose a supported document type.');
  const credential = await prisma.payoutCredential.findUnique({ where: { userId } });
  if (!credential) throw Error('Save your identity and payout details first.');
  if (credential.status === 'verified') throw Error('Your payout identity is already verified. No repeat submission is needed.');
  const identity = input.identityAssetId ? await validateEvidence(userId, input.identityAssetId) : null;
  const beneficiary = input.beneficiaryAssetId ? await validateEvidence(userId, input.beneficiaryAssetId) : null;
  if (input.submit && (!identity || !beneficiary || !input.consent)) throw Error('Add identity and beneficiary evidence and approve the declaration before submitting.');
  if (identity && beneficiary && identity.checksum === beneficiary.checksum) throw Error('Use separate identity and payout-beneficiary evidence.');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const latest = await tx.payoutCredential.findUniqueOrThrow({ where: { userId } });
    if (latest.updatedAt.getTime() !== credential.updatedAt.getTime()) throw Error('Your payout details changed. Refresh before submitting evidence.');
    for (const asset of [identity, beneficiary].filter(Boolean)) if (!await tx.storedAsset.count({ where: { id: asset!.id, ownerUserId: userId, deletedAt: null } })) throw Error('A document is no longer available. Upload it again.');
    const row = await tx.payoutVerification.upsert({ where: { userId }, create: { userId, documentType: input.documentType }, update: {} });
    const saved = await tx.payoutVerification.update({ where: { id: row.id }, data: { documentType: input.documentType, identityAssetId: identity?.id ?? null, beneficiaryAssetId: beneficiary?.id ?? null, status: input.submit ? 'submitted' : 'draft', consentAt: input.submit ? new Date() : null, credentialUpdatedAt: credential.updatedAt, checks: { fileIntegrity: 'passed', identityDocument: identity ? 'ready' : 'missing', beneficiaryDocument: beneficiary ? 'ready' : 'missing', externalIdentityCheck: 'not_performed', needsHumanDecision: true } } });
    if (input.submit) {
      await hubNotice(tx, userId, `artist-hub:kyc:${saved.id}:${saved.updatedAt.getTime()}`, 'Verification evidence submitted', 'Your documents passed file checks and were submitted to HYMN for identity and beneficiary review. Track verification in Earnings & payouts.');
      await tx.auditLog.create({ data: { actorId: userId, action: 'KYC_EVIDENCE_SUBMITTED', entity: 'payout_verification', entityId: String(saved.id), metadata: { identityAssetId: identity?.id, beneficiaryAssetId: beneficiary?.id, documentType: input.documentType, credentialUpdatedAt: credential.updatedAt.toISOString(), automatedChecks: 'file_integrity_only' } } });
    }
    return { status: saved.status };
  });
}
