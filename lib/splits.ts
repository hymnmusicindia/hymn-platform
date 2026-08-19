import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";
import { logAuditEvent } from "@/lib/audit-log";
import { emailAppUrl, sendSplitEmailEvent } from "@/lib/email/email-events";

export const SPLIT_ROLES = ["Primary Artist", "Featured Artist", "Producer", "Songwriter", "Composer", "Label", "Manager", "Other"] as const;
const CODE_LIFETIME_MS = 10 * 60 * 60 * 1000;

function codeHash(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function createCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  return `HYMN-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

function numeric(value: unknown) {
  if (typeof value === "object" && value && "toNumber" in value) return (value as { toNumber(): number }).toNumber();
  return Number(value ?? 0);
}

export async function getOrCreateSplitRecord(userId: number, releaseId: number, trackId?: number | null) {
  const release = await prisma.release.findFirst({ where: { id: releaseId, userId }, include: { tracks: true } });
  if (!release) throw new Error("Release not found or you do not own it.");
  if (trackId && !release.tracks.some((track) => track.id === trackId)) throw new Error("Track does not belong to this release.");
  const existing = await (prisma as any).splitRecord.findFirst({
    where: { releaseId, trackId: trackId ?? null, ownerUserId: userId, status: { not: "archived" } },
    include: { recipients: { orderBy: { createdAt: "asc" } }, release: true, track: true }
  });
  if (existing) return existing;
  const created = await (prisma as any).splitRecord.create({
    data: { releaseId, trackId: trackId ?? null, ownerUserId: userId },
    include: { recipients: true, release: true, track: true }
  });
  await logAuditEvent({ actorType: "user", actorId: userId, entityType: "split_record", entityId: created.id, action: "split.created", newValue: { releaseId, trackId: trackId ?? null } });
  return created;
}

export async function createSplitInvite(userId: number, input: {
  splitRecordId: number; method: "registered_email" | "split_code"; recipientEmail?: string; recipientName?: string;
  role: string; sharePercent: number; payoutEligible: boolean; note?: string;
}) {
  const record = await (prisma as any).splitRecord.findFirst({ where: { id: input.splitRecordId, ownerUserId: userId }, include: { recipients: true, release: true, owner: true } });
  if (!record) throw new Error("Split record not found or you do not own it.");
  if (["locked", "archived"].includes(record.status)) throw new Error("This split record is locked and cannot be edited.");
  if (!SPLIT_ROLES.includes(input.role as typeof SPLIT_ROLES[number])) throw new Error("Choose a valid collaborator role.");
  const sharePercent = Math.round(Number(input.sharePercent) * 100) / 100;
  if (!Number.isFinite(sharePercent) || sharePercent <= 0 || sharePercent > 100) throw new Error("Share must be greater than 0 and no more than 100%.");
  const allocated = record.recipients.filter((item: any) => item.payoutEligible && !["declined", "revoked", "expired"].includes(item.inviteStatus)).reduce((sum: number, item: any) => sum + numeric(item.sharePercent), 0);
  const nextEligibleTotal = allocated + (input.payoutEligible ? sharePercent : 0);
  if (nextEligibleTotal > 100.001) throw new Error("This invite would make the payout-eligible split total exceed 100%.");

  const email = input.recipientEmail?.trim().toLowerCase() || null;
  let recipientUser: { id: number; name: string; email: string } | null = null;
  if (input.method === "registered_email") {
    if (!email) throw new Error("Recipient HYMN email is required.");
    recipientUser = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, name: true, email: true } });
    if (!recipientUser) throw new Error("No HYMN account found with this email. Ask the collaborator to sign up first or use a split code instead.");
  }

  let code: string | null = null;
  if (input.method === "split_code") code = createCode();
  const expiresAt = code ? new Date(Date.now() + CODE_LIFETIME_MS) : null;
  const recipient = await (prisma as any).$transaction(async (tx: any) => {
    const created = await tx.splitRecipient.create({ data: {
      splitRecordId: record.id, releaseId: record.releaseId, trackId: record.trackId,
      recipientUserId: recipientUser?.id ?? null, recipientEmail: recipientUser?.email ?? email,
      recipientName: input.recipientName?.trim() || recipientUser?.name || "Collaborator", role: input.role,
      sharePercent, payoutEligible: Boolean(input.payoutEligible), inviteMethod: input.method,
      splitCodeHash: code ? codeHash(code) : null, splitCodeDisplay: code, splitCodeExpiresAt: expiresAt,
      inviteStatus: recipientUser?.id === userId ? "accepted" : "pending",
      acceptedAt: recipientUser?.id === userId ? new Date() : null,
      note: input.note?.trim() || null
    } });
    const nextTotal = nextEligibleTotal;
    const priorAccepted = record.recipients.filter((item: any) => !["declined", "revoked", "expired"].includes(item.inviteStatus)).every((item: any) => item.inviteStatus === "accepted");
    const newAccepted = recipientUser?.id === userId;
    await tx.splitRecord.update({ where: { id: record.id }, data: { totalSharePercent: nextTotal, status: Math.abs(nextTotal - 100) < 0.001 && priorAccepted && newAccepted ? "active" : "pending_acceptance" } });
    return created;
  });

  if (recipientUser && recipientUser.id !== userId) {
    await createNotificationOnce({ eventKey: `split:${record.id}:invite:${recipientUser.email}`, userId: recipientUser.id, title: "Split invite received", body: `${record.owner.name} added you to a split for “${record.release.title}”. Review and accept it from your dashboard.`, type: "payout", href: "/dashboard?module=splits&tab=requests", actionLabel: "Review split" });
    await sendSplitEmailEvent({ event: "split_invite_received", to: recipientUser.email, userId: recipientUser.id, splitId: record.id, recipientEmail: recipientUser.email, userName: recipientUser.name, ownerName: record.owner.name, releaseTitle: record.release.title, role: input.role, sharePercent, url: emailAppUrl("/dashboard?module=splits&tab=requests") });
  }
  await logAuditEvent({ actorType: "user", actorId: userId, entityType: "split_recipient", entityId: recipient.id, action: code ? "split.code_generated" : "split.invite_generated", newValue: { splitRecordId: record.id, method: input.method, role: input.role, sharePercent, expiresAt } });
  return { ...recipient, splitCode: code };
}

export async function previewSplitCode(userId: number, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!/^HYMN-[A-Z2-9]{6}$/.test(code)) throw new Error("Invalid split code. Check the code and try again.");
  const invite = await (prisma as any).splitRecipient.findUnique({ where: { splitCodeHash: codeHash(code) }, include: { splitRecord: { include: { owner: true } }, release: true, track: true } });
  if (!invite) throw new Error("Invalid split code. Check the code and try again.");
  if (invite.inviteStatus !== "pending" || invite.splitCodeUsedAt) throw new Error("This split code has already been used or is no longer active.");
  if (!invite.splitCodeExpiresAt || invite.splitCodeExpiresAt.getTime() <= Date.now()) {
    await (prisma as any).splitRecipient.update({ where: { id: invite.id }, data: { inviteStatus: "expired" } });
    throw new Error("This split code has expired. Ask the release owner to generate a new code.");
  }
  if (invite.splitRecord.ownerUserId === userId) throw new Error("A split owner cannot claim their own code.");
  return { id: invite.id, releaseName: invite.release.title, ownerName: invite.splitRecord.owner.name, role: invite.role, sharePercent: numeric(invite.sharePercent), payoutEligible: invite.payoutEligible, expiresAt: invite.splitCodeExpiresAt.toISOString() };
}

export async function respondToSplitInvite(userId: number, inviteId: number, response: "accepted" | "declined") {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (!user) throw new Error("User not found.");
  const invite = await (prisma as any).splitRecipient.findUnique({ where: { id: inviteId }, include: { splitRecord: true, release: true } });
  if (!invite || invite.inviteStatus !== "pending") throw new Error("This split invitation is no longer available.");
  const emailMatch = invite.recipientEmail?.toLowerCase() === user.email.toLowerCase();
  if (invite.recipientUserId && invite.recipientUserId !== userId) throw new Error("This invitation belongs to another account.");
  if (!invite.recipientUserId && invite.inviteMethod !== "split_code" && !emailMatch) throw new Error("This invitation belongs to another account.");
  if (invite.splitCodeExpiresAt && invite.splitCodeExpiresAt.getTime() <= Date.now()) throw new Error("This split code has expired. Ask the release owner to generate a new code.");
  const now = new Date();
  const updated = await (prisma as any).splitRecipient.update({ where: { id: invite.id }, data: {
    inviteStatus: response, recipientUserId: userId, recipientEmail: user.email, recipientName: user.name,
    acceptedAt: response === "accepted" ? now : null, declinedAt: response === "declined" ? now : null,
    splitCodeUsedAt: invite.inviteMethod === "split_code" ? now : invite.splitCodeUsedAt
  } });
  if (response === "accepted") {
    const credential = await (prisma as any).payoutCredential.findUnique({ where: { userId } });
    const held = await (prisma as any).splitEarningLineItem.findMany({ where: { splitRecordId: invite.splitRecordId, status: "held", OR: [{ recipientEmail: { equals: user.email, mode: "insensitive" } }, { recipientName: invite.recipientName }] } });
    for (const earning of held) {
      await (prisma as any).$transaction(async (tx: any) => {
        const current = await tx.splitEarningLineItem.findUnique({ where: { id: earning.id } });
        if (!current || current.status !== "held") return;
        if (!credential) {
          await tx.splitEarningLineItem.update({ where: { id: current.id }, data: { recipientUserId: userId, recipientEmail: user.email, status: "pending_payout_details" } });
          return;
        }
        const balance = await tx.artistPayoutBalance.upsert({ where: { userId }, create: { userId, availableBalance: current.netShareAmount, lifetimeEarnings: current.netShareAmount }, update: { availableBalance: { increment: current.netShareAmount }, lifetimeEarnings: { increment: current.netShareAmount }, lastUpdatedAt: new Date() } });
        await tx.walletTransaction.create({ data: { userId, type: "earning_credit", amount: current.netShareAmount, referenceType: "split_earning", referenceId: String(current.id), balanceAfter: balance.availableBalance, note: `Split earnings released for ${invite.release.title}` } });
        await tx.splitEarningLineItem.update({ where: { id: current.id }, data: { recipientUserId: userId, recipientEmail: user.email, status: "credited" } });
      });
    }
  }
  const refreshedRecipients = await (prisma as any).splitRecipient.findMany({ where: { splitRecordId: invite.splitRecordId, inviteStatus: { notIn: ["declined", "revoked", "expired"] } } });
  const refreshedTotal = refreshedRecipients.filter((row: any) => row.payoutEligible).reduce((sum: number, row: any) => sum + numeric(row.sharePercent), 0);
  const allAccepted = refreshedRecipients.every((row: any) => row.inviteStatus === "accepted");
  await (prisma as any).splitRecord.update({ where: { id: invite.splitRecordId }, data: { totalSharePercent: refreshedTotal, status: Math.abs(refreshedTotal - 100) < 0.001 && allAccepted ? "active" : "pending_acceptance" } });
  await createNotificationOnce({ eventKey: `split:${invite.splitRecordId}:${response}:${userId}`, userId: invite.splitRecord.ownerUserId, title: response === "accepted" ? "Split accepted" : "Split invite declined", body: response === "accepted" ? `${user.name} accepted the split invite for “${invite.release.title}”.` : `${user.name} declined the split invite for “${invite.release.title}”. Update the split record if needed.`, type: "payout", href: "/dashboard?module=splits", actionLabel: response === "accepted" ? "View split" : "Update split" });
  const owner = await prisma.user.findUnique({ where: { id: invite.splitRecord.ownerUserId }, select: { id: true, name: true, email: true } });
  if (owner) await sendSplitEmailEvent({ event: response === "accepted" ? "split_accepted" : "split_declined", to: owner.email, userId: owner.id, splitId: invite.splitRecordId, recipientEmail: user.email, userName: owner.name, recipientName: user.name, releaseTitle: invite.release.title, url: emailAppUrl("/dashboard?module=splits") });
  await logAuditEvent({ actorType: "user", actorId: userId, entityType: "split_recipient", entityId: invite.id, action: `split.invite_${response}`, oldValue: { status: "pending" }, newValue: { status: response, recipientUserId: userId } });
  return updated;
}

export async function revokeSplitInvite(userId: number, inviteId: number) {
  const invite = await (prisma as any).splitRecipient.findFirst({ where: { id: inviteId, splitRecord: { ownerUserId: userId } } });
  if (!invite || invite.inviteStatus !== "pending") throw new Error("Only a pending invite can be revoked by its owner.");
  const updated = await (prisma as any).splitRecipient.update({ where: { id: inviteId }, data: { inviteStatus: "revoked", revokedAt: new Date() } });
  await logAuditEvent({ actorType: "user", actorId: userId, entityType: "split_recipient", entityId: inviteId, action: "split.invite_revoked", oldValue: { status: "pending" }, newValue: { status: "revoked" } });
  return updated;
}

export async function listUserSplits(userId: number) {
  const [created, received, earnings] = await Promise.all([
    (prisma as any).splitRecord.findMany({ where: { ownerUserId: userId }, include: { release: true, track: true, recipients: { orderBy: { createdAt: "asc" } } }, orderBy: { updatedAt: "desc" } }),
    (prisma as any).splitRecipient.findMany({ where: { recipientUserId: userId }, include: { release: true, track: true, splitRecord: { include: { owner: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } }),
    (prisma as any).splitEarningLineItem.findMany({ where: { recipientUserId: userId }, include: { release: true, track: true, royaltyLineItem: true }, orderBy: { createdAt: "desc" } })
  ]);
  return { created, received, requests: received.filter((item: any) => item.inviteStatus === "pending"), earnings };
}
// vercel trigger 6
