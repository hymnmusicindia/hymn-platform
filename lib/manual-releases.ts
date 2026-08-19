import { Prisma, ReleaseStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";

const identifier = (value: string) => value.replace(/[\s-]/g, "").toUpperCase();
const trackSchema = z.object({
  id: z.number().int().positive().optional(), trackNumber: z.number().int().positive(), title: z.string().trim().min(1).max(200),
  version: z.string().trim().max(100).optional().default(""), primaryArtist: z.string().trim().min(1).max(200), featuredArtists: z.array(z.string().trim().min(1).max(200)).default([]),
  isrc: z.string().trim().transform(identifier).refine(value => !value || /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value), "Use a valid 12-character ISRC."),
  genre: z.string().trim().max(100).optional().default(""), subgenre: z.string().trim().max(100).optional().default(""), language: z.string().trim().max(80).optional().default(""),
  explicit: z.boolean().default(false), audioUrl: z.string().trim().max(2000).optional().default(""), duration: z.number().int().nonnegative().nullable().optional(), contributors: z.array(z.object({ role: z.string().trim().min(1), name: z.string().trim().min(1) })).default([])
});

export const manualReleaseSchema = z.object({
  ownerUserId: z.number().int().positive(), artistProfileId: z.number().int().positive(), title: z.string().trim().min(1).max(200), releaseType: z.enum(["Single", "EP", "Album"]),
  artistName: z.string().trim().min(1).max(200), featuredArtists: z.array(z.string().trim().min(1).max(200)).default([]), labelName: z.string().trim().max(200).optional().default(""),
  genre: z.string().trim().min(1).max(100), subgenre: z.string().trim().max(100).optional().default(""), mood: z.string().trim().max(100).optional().default(""), language: z.string().trim().max(80).optional().default(""),
  releaseDate: z.coerce.date(), originalReleaseDate: z.coerce.date().nullable().optional(), explicit: z.boolean().default(false), status: z.enum(["DRAFT", "UNDER_REVIEW", "SCHEDULED", "LIVE", "TAKEN_DOWN", "ARCHIVED"]),
  upc: z.string().trim().transform(identifier).refine(value => !value || /^\d{12,14}$/.test(value), "UPC must contain 12 to 14 digits."),
  cLine: z.string().trim().max(300).optional().default(""), pLine: z.string().trim().max(300).optional().default(""), copyrightYear: z.number().int().min(1900).max(2200).nullable().optional(), phonographicCopyrightYear: z.number().int().min(1900).max(2200).nullable().optional(),
  artworkUrl: z.string().trim().max(2000).optional().default(""), customerEditable: z.boolean().default(false), distributionProvider: z.string().trim().max(100).optional().default("Manual"), direNoteReleaseId: z.string().trim().max(200).optional().default(""),
  dspLinks: z.record(z.string(), z.string().trim().max(2000)).default({}), overrideReason: z.string().trim().max(500).optional().default(""), tracks: z.array(trackSchema).min(1)
}).superRefine((value, context) => {
  if (value.releaseType === "Single" && value.tracks.length !== 1) context.addIssue({ code: "custom", path: ["tracks"], message: "A single must contain exactly one track." });
  if (value.status === "LIVE") {
    const missing = [!value.artworkUrl && "artwork", !value.upc && "UPC", value.tracks.some(track => !track.isrc) && "track ISRC"].filter(Boolean);
    if (missing.length && value.overrideReason.length < 8) context.addIssue({ code: "custom", path: ["overrideReason"], message: `Live catalog is missing ${missing.join(", ")}; provide an override reason.` });
  }
});

const metadata = (input: z.infer<typeof manualReleaseSchema>) => ({ featuredArtists: input.featuredArtists, labelName: input.labelName, subgenre: input.subgenre, mood: input.mood, language: input.language, originalReleaseDate: input.originalReleaseDate?.toISOString() ?? null, cLine: input.cLine, pLine: input.pLine, copyrightYear: input.copyrightYear ?? null, phonographicCopyrightYear: input.phonographicCopyrightYear ?? null, distributionProvider: input.distributionProvider, dspLinks: Object.fromEntries(Object.entries(input.dspLinks).filter(([, url]) => url)), manualIdentifierOverrideReason: input.overrideReason || null });
const trackData = (track: z.infer<typeof trackSchema>) => ({ title: track.title, trackNumber: track.trackNumber, primaryArtist: track.primaryArtist, isrc: track.isrc || null, audioUrl: track.audioUrl || null, duration: track.duration ?? null, metadata: { version: track.version, featuredArtists: track.featuredArtists, genre: track.genre, subgenre: track.subgenre, language: track.language, explicitContent: track.explicit, contributors: track.contributors } as Prisma.InputJsonValue });

export async function createManualRelease(raw: unknown, adminId: number | null, assign: boolean) {
  const input = manualReleaseSchema.parse(raw);
  const [owner, artist] = await Promise.all([prisma.user.findUnique({ where: { id: input.ownerUserId } }), prisma.artistCard.findFirst({ where: { id: input.artistProfileId, userId: input.ownerUserId, archivedAt: null } })]);
  if (!owner || !artist) throw new Error("The selected owner or artist profile is invalid.");
  const release = await prisma.$transaction(async tx => {
    const created = await tx.release.create({ data: { userId: input.ownerUserId, ownerUserId: assign ? input.ownerUserId : null, artistProfileId: input.artistProfileId, releaseSource: "ADMIN_MANUAL", customerEditable: input.customerEditable, assignedByAdminId: adminId, assignedAt: assign ? new Date() : null, title: input.title, releaseType: input.releaseType.toLowerCase(), artistName: input.artistName, genre: input.genre, explicit: input.explicit, releaseDate: input.releaseDate, status: assign ? input.status as ReleaseStatus : "DRAFT", upc: input.upc || null, artworkUrl: input.artworkUrl || null, distributorReleaseId: input.direNoteReleaseId || null, paymentStatus: "not_required", metadata: metadata(input), tracks: { create: input.tracks.map(trackData) } }, include: { tracks: true, owner: true, artistProfile: true } });
    if (assign) await tx.releaseOwnershipHistory.create({ data: { releaseId: created.id, newOwnerUserId: input.ownerUserId, changedByAdminId: adminId, reason: "Initial manual catalog assignment" } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId: adminId, actorRole: "admin", action: assign ? "MANUAL_RELEASE_ASSIGNED" : "MANUAL_RELEASE_CREATED", entity: "release", entityId: String(created.id), metadata: { releaseSource: "ADMIN_MANUAL", ownerUserId: assign ? input.ownerUserId : null, trackCount: input.tracks.length, distributionQueued: false } } });
    return created;
  });
  if (assign) await createNotificationOnce({ eventKey: `manual-release:${release.id}:assigned:${input.ownerUserId}`, userId: input.ownerUserId, title: "A release has been added to your HYMN catalog.", body: `${release.title} · ${release.artistName}`, type: "release", href: `/dashboard/releases/${release.id}`, actionLabel: "View release" });
  return release;
}

export async function updateManualRelease(releaseId: number, raw: unknown, adminId: number | null) {
  const input = manualReleaseSchema.parse(raw);
  const existing = await prisma.release.findFirst({ where: { id: releaseId, releaseSource: "ADMIN_MANUAL" }, include: { tracks: { include: { royaltyLineItems: { select: { id: true }, take: 1 } } } } });
  if (!existing) throw new Error("Manual release not found.");
  if (existing.ownerUserId !== input.ownerUserId) throw new Error("Use the audited Transfer Release action to change ownership.");
  const artist = await prisma.artistCard.findFirst({ where: { id: input.artistProfileId, userId: input.ownerUserId, archivedAt: null } });
  if (!artist) throw new Error("The selected artist profile does not belong to this owner.");
  const retained = new Set(input.tracks.flatMap(track => track.id ? [track.id] : []));
  if (existing.tracks.some(track => !retained.has(track.id) && track.royaltyLineItems.length)) throw new Error("A track with royalty history cannot be removed.");
  return prisma.$transaction(async tx => {
    await tx.track.deleteMany({ where: { releaseId, id: { notIn: [...retained] }, royaltyLineItems: { none: {} } } });
    for (const track of input.tracks) {
      const data = trackData(track);
      if (track.id && existing.tracks.some(row => row.id === track.id)) await tx.track.update({ where: { id: track.id }, data });
      else await tx.track.create({ data: { releaseId, ...data } });
    }
    const updated = await tx.release.update({ where: { id: releaseId }, data: { artistProfileId: input.artistProfileId, customerEditable: input.customerEditable, title: input.title, releaseType: input.releaseType.toLowerCase(), artistName: input.artistName, genre: input.genre, explicit: input.explicit, releaseDate: input.releaseDate, status: input.status as ReleaseStatus, upc: input.upc || null, artworkUrl: input.artworkUrl || null, distributorReleaseId: input.direNoteReleaseId || null, metadata: metadata(input), version: { increment: 1 }, lastEditedAt: new Date() }, include: { tracks: true, owner: true, artistProfile: true } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId: adminId, actorRole: "admin", action: "MANUAL_RELEASE_EDITED", entity: "release", entityId: String(releaseId), metadata: { version: updated.version, distributionQueued: false } } });
    return updated;
  });
}

export async function transferManualRelease(releaseId: number, newOwnerUserId: number, reason: string, adminId: number | null) {
  if (reason.trim().length < 8) throw new Error("A meaningful transfer reason is required.");
  const release = await prisma.release.findFirst({ where: { id: releaseId, releaseSource: "ADMIN_MANUAL" } });
  const owner = await prisma.user.findUnique({ where: { id: newOwnerUserId } });
  if (!release || !owner || release.ownerUserId === newOwnerUserId) throw new Error("Choose a different valid owner.");
  return prisma.$transaction(async tx => {
    const updated = await tx.release.update({ where: { id: releaseId }, data: { userId: newOwnerUserId, ownerUserId: newOwnerUserId, artistProfileId: null, assignedByAdminId: adminId, assignedAt: new Date() } });
    await tx.releaseOwnershipHistory.create({ data: { releaseId, previousOwnerUserId: release.ownerUserId, newOwnerUserId, changedByAdminId: adminId, reason: reason.trim() } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId: adminId, actorRole: "admin", action: "MANUAL_RELEASE_TRANSFERRED", entity: "release", entityId: String(releaseId), reason: reason.trim(), riskLevel: "high", metadata: { previousOwnerUserId: release.ownerUserId, newOwnerUserId } } });
    return updated;
  });
}
