import { createHash, randomBytes } from "crypto";
import { findSplitArtist } from "@/lib/user-handles";
import { prisma } from "@/lib/prisma";
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
    if (typeof value === "object" && value && "toNumber" in value)
        return (value as {
            toNumber(): number;
        }).toNumber();
    return Number(value ?? 0);
}
const inactive = ["declined", "revoked", "expired"];
export async function refreshSplit(tx: any, id: number) {
    await tx.splitRecipient.updateMany({ where: { splitRecordId: id, inviteStatus: "pending", splitCodeExpiresAt: { lte: new Date() } }, data: { inviteStatus: "expired" } });
    const rows = await tx.splitRecipient.findMany({ where: { splitRecordId: id, inviteStatus: { notIn: inactive } } });
    const total = rows.filter((r: any) => r.payoutEligible).reduce((sum: number, r: any) => sum + Math.round(numeric(r.sharePercent) * 100), 0) / 100;
    const current = await tx.splitRecord.findUniqueOrThrow({ where: { id } });
    if (!["locked", "archived"].includes(current.status))
        await tx.splitRecord.update({ where: { id }, data: { totalSharePercent: total, status: total === 100 && rows.every((r: any) => r.inviteStatus === "accepted") ? "active" : rows.length ? "pending_acceptance" : "draft" } });
    return rows;
}
async function lockRecord(tx: any, id: number) {
    if (!Number.isSafeInteger(id) || id <= 0)
        throw new Error("Invalid split record.");
    await tx.$queryRaw `SELECT id FROM split_records WHERE id = ${id} FOR UPDATE`;
}
export async function getOrCreateSplitRecord(userId: number, releaseId: number, trackId?: number | null) {
    if (trackId != null && (!Number.isSafeInteger(trackId) || trackId <= 0)) throw new Error("Choose a valid track.");
    if (!Number.isSafeInteger(releaseId) || releaseId <= 0)
        throw new Error("Choose a release.");
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT id FROM releases WHERE id = ${releaseId} FOR UPDATE`;
        const release = await tx.release.findFirst({ where: { id: releaseId, userId }, include: { tracks: true } });
        if (!release)
            throw new Error("Release not found or you do not own it.");
        if (trackId && !release.tracks.some(track => track.id === trackId))
            throw new Error("Track does not belong to this release.");
        const include = { recipients: { orderBy: { createdAt: "asc" as const } }, release: true, track: true };
        const existing = await tx.splitRecord.findFirst({ where: { releaseId, trackId: trackId ?? null, ownerUserId: userId, status: { not: "archived" } }, include, orderBy: { createdAt: "desc" } });
        if (existing)
            return existing;
        const created = await tx.splitRecord.create({ data: { releaseId, trackId: trackId ?? null, ownerUserId: userId }, include });
        await tx.auditLog.create({ data: { actorId: userId, action: "SPLIT_CREATED", entity: "split_record", entityId: String(created.id), metadata: { releaseId, trackId: trackId ?? null } } });
        return created;
    }, { timeout: 30000 });
}
export async function createSplitInvite(userId: number, input: {
    splitRecordId: number;
    method: "registered_email" | "split_code";
    recipientEmail?: string;
    recipientHandle?: string;
    recipientName?: string;
    contributorPartyId?: number;
    role: string;
    sharePercent: number;
    payoutEligible: boolean;
    note?: string;
}) {
    if (!SPLIT_ROLES.includes(input.role as typeof SPLIT_ROLES[number]))
        throw new Error("Choose a valid collaborator role.");
    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (actor?.status !== "ACTIVE")
        throw new Error("An active account is required.");
    const sharePercent = Number(input.sharePercent);
    if (!Number.isFinite(sharePercent) || sharePercent <= 0 || sharePercent > 100 || Math.abs(sharePercent * 100 - Math.round(sharePercent * 100)) > 0.000001)
        throw new Error("Share must be between 0.01 and 100%, with at most two decimal places.");
    if ((input.note?.length ?? 0) > 2000)
        throw new Error("Keep the note under 2,000 characters.");
    const email = input.recipientEmail?.trim().toLowerCase() || null;
    let recipientUser: {
        id: number;
        name: string;
        email: string;
    } | null = null;
    if (input.method === "registered_email") {
        recipientUser = await findSplitArtist(input.recipientHandle || email || "");
        if (!recipientUser)
            throw new Error("No active HYMN account found. Check the full email or @name#1234 handle.");
    }
    const claimedParty = recipientUser ? await prisma.contributorParty.findUnique({ where: { claimedByUserId: recipientUser.id } }) : null;
    if (input.contributorPartyId && input.contributorPartyId !== claimedParty?.id)
        throw new Error("Contributor identity must belong to the invited account.");
    const contributorPartyId = claimedParty?.id ?? null;
    let code: string | null = null;
    if (input.method === "split_code")
        code = createCode();
    const expiresAt = code ? new Date(Date.now() + CODE_LIFETIME_MS) : null;
    const { recipient, record } = await prisma.$transaction(async (tx) => {
        await lockRecord(tx, input.splitRecordId);
        const record = await tx.splitRecord.findFirst({ where: { id: input.splitRecordId, ownerUserId: userId, release: { userId } }, include: { release: true, owner: true } });
        if (!record)
            throw new Error("Split record not found or you do not own the release.");
        if (["locked", "archived"].includes(record.status))
            throw new Error("This agreement is locked. Contact support for a future amendment; historical earnings stay unchanged.");
        const rows = await refreshSplit(tx, record.id);
        if (recipientUser && rows.some((r: any) => r.recipientUserId === recipientUser!.id))
            throw new Error("This artist already has an active share in this agreement.");
        if (rows.length >= 100) throw new Error("An agreement supports up to 100 active collaborators.");
        const allocated = rows.filter((r: any) => r.payoutEligible).reduce((sum: number, r: any) => sum + Math.round(numeric(r.sharePercent) * 100), 0);
        if (allocated + (input.payoutEligible ? Math.round(sharePercent * 100) : 0) > 10000)
            throw new Error("Combined shares cannot exceed 100%.");
        const created = await tx.splitRecipient.create({ data: {
                splitRecordId: record.id, releaseId: record.releaseId, trackId: record.trackId,
                recipientUserId: recipientUser?.id ?? null, recipientEmail: recipientUser?.email ?? email,
                contributorPartyId,
                recipientName: recipientUser?.name || input.recipientName?.trim().slice(0, 100) || "Collaborator", role: input.role,
                sharePercent, payoutEligible: Boolean(input.payoutEligible), inviteMethod: input.method,
                splitCodeHash: code ? codeHash(code) : null, splitCodeDisplay: code, splitCodeExpiresAt: expiresAt,
                inviteStatus: recipientUser?.id === userId ? "accepted" : "pending",
                acceptedAt: recipientUser?.id === userId ? new Date() : null,
                note: input.note?.trim() || null
            } });
        await refreshSplit(tx, record.id);
        if (recipientUser && recipientUser.id !== userId)
            await tx.notification.create({ data: { eventKey: `split-invite:${created.id}:received`, userId: recipientUser.id, title: "Split invitation received", body: `${record.owner.name} invited you to a ${sharePercent}% share in "${record.release.title}".`, type: "payout", href: "/dashboard?tab=collaborators&splitView=requests", actionLabel: "Review split" } });
        await tx.auditLog.create({ data: { actorId: userId, action: code ? "SPLIT_CODE_GENERATED" : "SPLIT_INVITE_GENERATED", entity: "split_recipient", entityId: String(created.id), metadata: { splitRecordId: record.id, method: input.method, role: input.role, sharePercent, expiresAt: expiresAt?.toISOString() ?? null } } });
        return { recipient: created, record };
    }, { timeout: 30000 });
    let deliveryStatus = "not_needed";
    if (recipientUser && recipientUser.id !== userId) {
        const delivery = await sendSplitEmailEvent({ event: "split_invite_received", to: recipientUser.email, userId: recipientUser.id, splitId: record.id, inviteId: recipient.id, recipientEmail: recipientUser.email, userName: recipientUser.name, ownerName: record.owner.name, releaseTitle: record.release.title, role: input.role, sharePercent, url: emailAppUrl("/dashboard?tab=collaborators&splitView=requests") });
        deliveryStatus = delivery.status;
    }
    return { ...recipient, splitCode: code, deliveryStatus };
}
export async function previewSplitCode(userId: number, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!/^HYMN-[A-Z2-9]{6}$/.test(code))
        throw new Error("Invalid split code. Check the code and try again.");
    const invite = await (prisma as any).splitRecipient.findUnique({ where: { splitCodeHash: codeHash(code) }, include: { splitRecord: { include: { owner: true } }, release: true, track: true } });
    if (!invite)
        throw new Error("Invalid split code. Check the code and try again.");
    if (invite.inviteStatus !== "pending" || invite.splitCodeUsedAt)
        throw new Error("This split code has already been used or is no longer active.");
    if (!invite.splitCodeExpiresAt || invite.splitCodeExpiresAt.getTime() <= Date.now()) {
        throw new Error("This split code has expired. Ask the release owner to generate a new code.");
    }
    if (["locked", "archived"].includes(invite.splitRecord.status))
        throw new Error("This agreement is no longer accepting invitations.");
    if (invite.splitRecord.ownerUserId === userId)
        throw new Error("A split owner cannot claim their own code.");
    return { id: invite.id, releaseName: invite.release.title, ownerName: invite.splitRecord.owner.name, role: invite.role, sharePercent: numeric(invite.sharePercent), payoutEligible: invite.payoutEligible, expiresAt: invite.splitCodeExpiresAt.toISOString() };
}
export async function respondToSplitInvite(userId: number, inviteId: number, response: "accepted" | "declined", rawCode?: string) {
    if (!Number.isSafeInteger(inviteId) || inviteId <= 0) throw new Error("Invalid invitation.");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true, status: true } });
    if (user.status !== "ACTIVE")
        throw new Error("An active account is required.");
    const { updated, invite } = await prisma.$transaction(async (tx) => {
        const ref = await tx.splitRecipient.findUnique({ where: { id: inviteId }, select: { splitRecordId: true } });
        if (!ref)
            throw new Error("Invitation not found.");
        await lockRecord(tx, ref.splitRecordId);
        const invite = await tx.splitRecipient.findUniqueOrThrow({ where: { id: inviteId }, include: { splitRecord: { include: { owner: true } }, release: true } });
        if (invite.inviteStatus !== "pending" || ["locked", "archived"].includes(invite.splitRecord.status))
            throw new Error("This invitation is no longer available.");
        if (invite.recipientUserId ? invite.recipientUserId !== userId : invite.inviteMethod !== "split_code" && invite.recipientEmail?.toLowerCase() !== user.email.toLowerCase())
            throw new Error("This invitation belongs to another account.");
        if (invite.inviteMethod === "split_code" && (!rawCode || codeHash(rawCode) !== invite.splitCodeHash || invite.splitCodeUsedAt || invite.splitRecord.ownerUserId === userId))
            throw new Error("Provide the original split code to respond to this invitation.");
        if (invite.splitCodeExpiresAt && invite.splitCodeExpiresAt <= new Date())
            throw new Error("This code has expired. Ask the owner for a new invitation.");
        const duplicate = await tx.splitRecipient.findFirst({ where: { splitRecordId: ref.splitRecordId, recipientUserId: userId, id: { not: inviteId }, inviteStatus: { notIn: inactive } } });
        if (duplicate)
            throw new Error("You already have an active share in this agreement.");
        const updated = await tx.splitRecipient.update({ where: { id: inviteId }, data: { inviteStatus: response, recipientUserId: userId, recipientEmail: user.email, recipientName: user.name, acceptedAt: response === "accepted" ? new Date() : null, declinedAt: response === "declined" ? new Date() : null, splitCodeUsedAt: invite.inviteMethod === "split_code" ? new Date() : null } });
        await refreshSplit(tx, ref.splitRecordId);
        await tx.auditLog.create({ data: { actorId: userId, action: `SPLIT_${response.toUpperCase()}`, entity: "split_recipient", entityId: String(inviteId), metadata: { splitRecordId: ref.splitRecordId, sharePercent: String(invite.sharePercent), role: invite.role } } });
        await tx.notification.create({ data: { eventKey: `split-invite:${inviteId}:${response}`, userId: invite.splitRecord.ownerUserId, title: response === "accepted" ? "Split accepted" : "Split declined", body: `${user.name} ${response} the ${numeric(invite.sharePercent)}% invitation for "${invite.release.title}".`, type: "payout", href: "/dashboard?tab=collaborators", actionLabel: "View agreement" } });
        return { updated, invite };
    }, { timeout: 30000 });
    const owner = invite.splitRecord.owner;
    await sendSplitEmailEvent({ event: response === "accepted" ? "split_accepted" : "split_declined", to: owner.email, userId: owner.id, splitId: invite.splitRecordId, inviteId, recipientEmail: user.email, userName: owner.name, recipientName: user.name, releaseTitle: invite.release.title, url: emailAppUrl("/dashboard?tab=collaborators") });
    return updated;
}
export async function revokeSplitInvite(userId: number, inviteId: number) {
    if (!Number.isSafeInteger(inviteId) || inviteId <= 0) throw new Error("Invalid invitation.");
    const updated = await prisma.$transaction(async (tx) => {
        const ref = await tx.splitRecipient.findUnique({ where: { id: inviteId }, select: { splitRecordId: true } });
        if (!ref)
            throw new Error("Invitation not found.");
        await lockRecord(tx, ref.splitRecordId);
        const invite = await tx.splitRecipient.findFirst({ where: { id: inviteId, splitRecord: { ownerUserId: userId, release: { userId }, status: { notIn: ["locked", "archived"] } } } });
        if (!invite || invite.inviteStatus !== "pending")
            throw new Error("Only the owner can revoke a pending invitation.");
        const updated = await tx.splitRecipient.update({ where: { id: inviteId }, data: { inviteStatus: "revoked", revokedAt: new Date() } });
        await refreshSplit(tx, ref.splitRecordId);
        await tx.auditLog.create({ data: { actorId: userId, action: "SPLIT_REVOKED", entity: "split_recipient", entityId: String(inviteId) } });
        if (updated.recipientUserId)
            await tx.notification.create({ data: { eventKey: `split-invite:${inviteId}:revoked`, userId: updated.recipientUserId, title: "Split invitation withdrawn", body: "The release owner withdrew a pending invitation.", type: "payout", href: "/dashboard?tab=collaborators&splitView=shared" } });
        return updated;
    });
    return updated;
}
export async function listUserSplits(userId: number) {
    const expiring = await prisma.splitRecord.findMany({ where: { ownerUserId: userId, recipients: { some: { inviteStatus: "pending", splitCodeExpiresAt: { lte: new Date() } } } }, select: { id: true } });
    for (const record of expiring)
        await prisma.$transaction(async (tx) => { await lockRecord(tx, record.id); await refreshSplit(tx, record.id); });
    const [created, received, earnings] = await Promise.all([
        (prisma as any).splitRecord.findMany({ where: { ownerUserId: userId }, include: { release: true, track: true, recipients: { orderBy: { createdAt: "asc" } } }, orderBy: { updatedAt: "desc" } }),
        (prisma as any).splitRecipient.findMany({ where: { recipientUserId: userId }, include: { release: { select: { id: true, title: true } }, track: { select: { id: true, title: true } }, splitRecord: { select: { status: true, owner: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } }),
        (prisma as any).splitEarningLineItem.findMany({ where: { recipientUserId: userId }, include: { release: { select: { id: true, title: true } }, track: { select: { id: true, title: true } }, royaltyLineItem: { select: { statementMonth: true, platform: true } } }, orderBy: { createdAt: "desc" } })
    ]);
    const cleanRecipient = (row: any, keepCode = false) => {
        const safe = { ...row }; delete safe.splitCodeHash;
        if (!keepCode) delete safe.splitCodeDisplay;
        return safe;
    };
    const safeReceived = received.map((row: any) => cleanRecipient(row));
    return { created: created.map((record: any) => ({ ...record, recipients: record.recipients.map((row: any) => cleanRecipient(row, true)) })), received: safeReceived, requests: safeReceived.filter((item: any) => item.inviteStatus === "pending"), earnings };
}
// vercel trigger 6
// vercel trigger 9
/** A new version never rewrites an already allocated statement. */
export async function amendSplitAgreement(userId: number, recordId: number, effectivePeriod: string) {
    if (!/^\d{4}-\d{2}$/.test(effectivePeriod))
        throw new Error("Choose a future statement month.");
    const [year, month] = effectivePeriod.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, 1));
    const now = new Date();
    if (month < 1 || month > 12 || date <= new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) || year > now.getUTCFullYear() + 5)
        throw new Error("Amendments must start in a future month within five years.");
    return prisma.$transaction(async (tx) => {
        await lockRecord(tx, recordId);
        const record = await tx.splitRecord.findFirst({ where: { id: recordId, ownerUserId: userId, release: { userId }, status: "locked" } });
        if (!record)
            throw new Error("Only the owner can create a future version of a locked agreement.");
        const open = await tx.splitRecord.findFirst({ where: { releaseId: record.releaseId, trackId: record.trackId, status: { in: ["draft", "pending_acceptance", "active"] }, id: { not: recordId } } });
        if (open)
            throw new Error("Finish or cancel the existing amendment before creating another.");
        if (record.effectiveFromYear && (year * 12 + month <= record.effectiveFromYear * 12 + (record.effectiveFromMonth || 1)))
            throw new Error("Choose a month after this agreement's start date.");
        const created = await tx.splitRecord.create({ data: { releaseId: record.releaseId, trackId: record.trackId, ownerUserId: userId, effectiveFromMonth: month, effectiveFromYear: year } });
        await tx.auditLog.create({ data: { actorId: userId, action: "SPLIT_AMENDMENT_CREATED", entity: "split_record", entityId: String(created.id), metadata: { replaces: recordId, effectivePeriod } } });
        return created;
    }, { timeout: 30000 });
}
export async function cancelSplitAgreement(userId: number, recordId: number) {
    return prisma.$transaction(async (tx) => {
        await lockRecord(tx, recordId);
        const record = await tx.splitRecord.findFirst({ where: { id: recordId, ownerUserId: userId, release: { userId } }, include: { recipients: true } });
        if (!record || ["locked", "archived"].includes(record.status) || await tx.splitEarningLineItem.count({ where: { splitRecordId: recordId } }) > 0)
            throw new Error("Allocated agreements cannot be cancelled. Create a future amendment instead.");
        await tx.splitRecord.update({ where: { id: recordId }, data: { status: "archived" } });
        await tx.splitRecipient.updateMany({ where: { splitRecordId: recordId, inviteStatus: { in: ["pending", "accepted"] } }, data: { inviteStatus: "revoked", revokedAt: new Date() } });
        for (const row of record.recipients)
            if (row.recipientUserId && row.recipientUserId !== userId && ["pending", "accepted"].includes(row.inviteStatus))
                await tx.notification.create({ data: { userId: row.recipientUserId, eventKey: `split:${recordId}:cancelled:${row.id}`, title: "Split agreement cancelled", body: "The owner cancelled an agreement before earnings were allocated. Any replacement requires your acceptance again.", type: "payout", href: "/dashboard?tab=collaborators&splitView=shared" } });
        await tx.auditLog.create({ data: { actorId: userId, action: "SPLIT_CANCELLED", entity: "split_record", entityId: String(recordId) } });
        return { cancelled: true };
    }, { timeout: 30000 });
}
