import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit-log";

function encryptionKey() {
  const source = process.env.PAYOUT_ENCRYPTION_KEY?.trim();
  if (!source && process.env.NODE_ENV === "production") throw new Error("PAYOUT_ENCRYPTION_KEY is required in production.");
  return createHash("sha256").update(source || "local-development-only-key").digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptPayoutSecret(payload: string) {
  const [iv, tag, encrypted] = payload.split(".").map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function maskAccount(value: string) { return `•••• ${value.slice(-4)}`; }
function maskUpi(value: string) { const [name, provider] = value.split("@"); return `${name.slice(0, 2)}•••@${provider || "upi"}`; }
function maskIfsc(value: string) { return `${value.slice(0, 4)}•••${value.slice(-2)}`; }

export async function getPayoutCredential(userId: number) {
  const row = await (prisma as any).payoutCredential.findUnique({ where: { userId } });
  if (!row) return { status: "missing" as const, method: null, upiIdMasked: null, accountHolderName: null, bankAccountMasked: null, ifscMasked: null, updatedAt: null };
  return { status: row.status, method: row.method, upiIdMasked: row.upiIdMasked, accountHolderName: row.accountHolderName, bankAccountMasked: row.bankAccountMasked, ifscMasked: row.ifscMasked, updatedAt: row.updatedAt.toISOString() };
}

export async function savePayoutCredential(userId: number, input: { method: "UPI" | "BANK"; legalName?: string; country?: string; taxResidency?: string; upiId?: string; accountHolderName?: string; bankAccountNumber?: string; ifsc?: string; taxInfo?: string }) {
  if (!['UPI', 'BANK'].includes(input.method)) throw new Error("Choose UPI or Bank Transfer.");
  const upi = input.upiId?.trim().toLowerCase();
  const account = input.bankAccountNumber?.replace(/\s+/g, "");
  const holder = input.accountHolderName?.trim();
  const ifsc = input.ifsc?.trim().toUpperCase();
  const legalName = input.legalName?.trim(); const country = input.country?.trim().toUpperCase();
  if (!legalName || legalName.length < 2 || !country || !/^[A-Z]{2}$/.test(country)) throw new Error("Legal name and two-letter country are required for manual verification.");
  if (input.method === "UPI" && (!upi || !/^[\w.-]{2,}@[\w.-]{2,}$/.test(upi))) throw new Error("Enter a valid UPI ID.");
  if (input.method === "BANK" && (!holder || !account || !/^\d{6,20}$/.test(account) || !ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))) throw new Error("Enter valid account holder, account number, and IFSC details.");
  const existing = await (prisma as any).payoutCredential.findUnique({ where: { userId } });
  const data = input.method === "UPI" ? {
    method: "UPI", upiIdMasked: maskUpi(upi!), upiIdEncrypted: encrypt(upi!), accountHolderName: null,
    bankAccountMasked: null, bankAccountEncrypted: null, ifscMasked: null, ifscEncrypted: null,
    taxInfoEncrypted: input.taxInfo?.trim() ? encrypt(input.taxInfo.trim()) : null, legalName, country, taxResidency: input.taxResidency?.trim() || null, panLastFour: input.taxInfo?.trim().slice(-4) || null, status: "submitted", rejectionReason: null, verifiedAt: null, verifiedByAdminId: null
  } : {
    method: "BANK", upiIdMasked: null, upiIdEncrypted: null, accountHolderName: holder!,
    bankAccountMasked: maskAccount(account!), bankAccountEncrypted: encrypt(account!), ifscMasked: maskIfsc(ifsc!), ifscEncrypted: encrypt(ifsc!),
    taxInfoEncrypted: input.taxInfo?.trim() ? encrypt(input.taxInfo.trim()) : null, legalName, country, taxResidency: input.taxResidency?.trim() || null, panLastFour: input.taxInfo?.trim().slice(-4) || null, status: "submitted", rejectionReason: null, verifiedAt: null, verifiedByAdminId: null
  };
  const saved = await (prisma as any).payoutCredential.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await logAuditEvent({ actorType: "user", actorId: userId, entityType: "payout_credential", entityId: saved.id, action: existing ? "payout_credential.updated" : "payout_credential.created", oldValue: existing ? { method: existing.method, status: existing.status } : null, newValue: { method: saved.method, status: saved.status } });
  return getPayoutCredential(userId);
}

export async function releaseVerifiedPayoutEarnings(userId: number, transaction?: Prisma.TransactionClient) {
  const execute = async (tx: Prisma.TransactionClient) => {
    const profile = await tx.payoutCredential.findUnique({ where: { userId } });
    if (!profile || profile.status !== "verified") throw new Error("Verified payout profile required.");
    const held = await tx.splitEarningLineItem.findMany({ where: { recipientUserId: userId, status: "pending_payout_details" } });
    for (const earning of held) {
      const balance = await tx.artistPayoutBalance.upsert({ where: { userId }, create: { userId, availableBalance: earning.netShareAmount, lifetimeEarnings: earning.netShareAmount }, update: { availableBalance: { increment: earning.netShareAmount }, lifetimeEarnings: { increment: earning.netShareAmount }, lastUpdatedAt: new Date() } });
      await tx.walletTransaction.create({ data: { userId, type: "earning_release", amount: 0, direction: "release", idempotencyKey: `split-earning:${earning.id}:release`, referenceType: "split_earning", referenceId: String(earning.id), balanceAfter: balance.availableBalance, availabilityStatus: "available", auditMetadata: { releasedAmount: earning.netShareAmount.toString(), reason: "payout_profile_verified" }, note: "Held split earnings released after manual payout-profile verification." } });
      await tx.splitEarningLineItem.update({ where: { id: earning.id }, data: { status: "credited" } });
    }
    return held.length;
  };
  return transaction ? execute(transaction) : prisma.$transaction(execute);
}

export async function reviewPayoutCredential(userId: number, input: { status: "under_review" | "changes_requested" | "verified" | "rejected" | "suspended"; note: string; actorId?: number | null }) {
  if (input.note.trim().length < 3) throw new Error("A verification note is required.");
  const existing = await prisma.payoutCredential.findUnique({ where: { userId } });
  if (!existing) throw new Error("Payout profile not found.");
  const allowed: Record<string, string[]> = { submitted: ["under_review", "changes_requested", "verified", "rejected"], under_review: ["changes_requested", "verified", "rejected"], changes_requested: ["under_review", "verified", "rejected"], verified: ["suspended"], rejected: ["under_review"], suspended: ["under_review", "verified"] };
  if (!allowed[existing.status]?.includes(input.status)) throw new Error(`Payout profile cannot move from ${existing.status} to ${input.status}.`);
  const result = await prisma.$transaction(async tx => {
    const profile = await tx.payoutCredential.update({ where: { userId }, data: { status: input.status, verificationNote: input.note.trim(), rejectionReason: ["changes_requested", "rejected"].includes(input.status) ? input.note.trim() : null, verifiedAt: input.status === "verified" ? new Date() : null, verifiedByAdminId: input.status === "verified" ? input.actorId : null } });
    const releasedEarnings = input.status === "verified" ? await releaseVerifiedPayoutEarnings(userId, tx) : 0;
    await tx.auditLog.create({ data: { actorId: input.actorId, action: "KYC_DECISION", entity: "payout_credential", entityId: String(profile.id), metadata: { previousStatus: existing.status, newStatus: input.status, note: input.note.trim(), releasedEarnings } } });
    return { profile, releasedEarnings };
  });
  return result;
}
// vercel trigger 9
