import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
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

export async function savePayoutCredential(userId: number, input: { method: "UPI" | "BANK"; upiId?: string; accountHolderName?: string; bankAccountNumber?: string; ifsc?: string; taxInfo?: string }) {
  if (!['UPI', 'BANK'].includes(input.method)) throw new Error("Choose UPI or Bank Transfer.");
  const upi = input.upiId?.trim().toLowerCase();
  const account = input.bankAccountNumber?.replace(/\s+/g, "");
  const holder = input.accountHolderName?.trim();
  const ifsc = input.ifsc?.trim().toUpperCase();
  if (input.method === "UPI" && (!upi || !/^[\w.-]{2,}@[\w.-]{2,}$/.test(upi))) throw new Error("Enter a valid UPI ID.");
  if (input.method === "BANK" && (!holder || !account || !/^\d{6,20}$/.test(account) || !ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))) throw new Error("Enter valid account holder, account number, and IFSC details.");
  const existing = await (prisma as any).payoutCredential.findUnique({ where: { userId } });
  const data = input.method === "UPI" ? {
    method: "UPI", upiIdMasked: maskUpi(upi!), upiIdEncrypted: encrypt(upi!), accountHolderName: null,
    bankAccountMasked: null, bankAccountEncrypted: null, ifscMasked: null, ifscEncrypted: null,
    taxInfoEncrypted: input.taxInfo?.trim() ? encrypt(input.taxInfo.trim()) : null, status: "submitted"
  } : {
    method: "BANK", upiIdMasked: null, upiIdEncrypted: null, accountHolderName: holder!,
    bankAccountMasked: maskAccount(account!), bankAccountEncrypted: encrypt(account!), ifscMasked: maskIfsc(ifsc!), ifscEncrypted: encrypt(ifsc!),
    taxInfoEncrypted: input.taxInfo?.trim() ? encrypt(input.taxInfo.trim()) : null, status: "submitted"
  };
  const saved = await (prisma as any).payoutCredential.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  const heldEarnings = await (prisma as any).splitEarningLineItem.findMany({ where: { recipientUserId: userId, status: "pending_payout_details" } });
  for (const earning of heldEarnings) {
    await (prisma as any).$transaction(async (tx: any) => {
      const current = await tx.splitEarningLineItem.findUnique({ where: { id: earning.id } });
      if (!current || current.status !== "pending_payout_details") return;
      const balance = await tx.artistPayoutBalance.upsert({ where: { userId }, create: { userId, availableBalance: current.netShareAmount, lifetimeEarnings: current.netShareAmount }, update: { availableBalance: { increment: current.netShareAmount }, lifetimeEarnings: { increment: current.netShareAmount }, lastUpdatedAt: new Date() } });
      await tx.walletTransaction.create({ data: { userId, type: "earning_credit", amount: current.netShareAmount, referenceType: "split_earning", referenceId: String(current.id), balanceAfter: balance.availableBalance, note: "Split earnings released after payout details were added" } });
      await tx.splitEarningLineItem.update({ where: { id: current.id }, data: { status: "credited" } });
    });
  }
  await logAuditEvent({ actorType: "user", actorId: userId, entityType: "payout_credential", entityId: saved.id, action: existing ? "payout_credential.updated" : "payout_credential.created", oldValue: existing ? { method: existing.method, status: existing.status } : null, newValue: { method: saved.method, status: saved.status } });
  return getPayoutCredential(userId);
}
