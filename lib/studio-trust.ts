import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { VOUCH_STRENGTHS } from "@/lib/studio-trust-domain";
export const publicWebUrl = z.string().trim().url().max(1000).refine(value => /^https:\/\//i.test(value), "Use a public HTTPS link.");
export const vouchSchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().min(10).max(1000), publicName: z.string().trim().max(80).optional(), publicNameConsent: z.boolean().default(false), relationship: z.enum(["Artist", "Producer", "Collaborator", "Previous client"]), workUrl: publicWebUrl, strengths: z.array(z.enum(VOUCH_STRENGTHS)).max(5).default([]) });
export const showcaseSchema = z.object({ title: z.string().trim().min(2).max(120), role: z.enum(["Mixing", "Mastering", "Mixing & Mastering", "Vocal tuning"]), artistEmail: z.string().trim().toLowerCase().email(), beforeUrl: publicWebUrl.or(z.literal("")).optional(), afterUrl: publicWebUrl, releaseUrl: publicWebUrl.or(z.literal("")).optional(), breakdown: z.string().trim().min(30).max(2000), rightsConfirmed: z.literal(true) });
export const phoneSchema = z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/, "Add a phone number with country code.");
export async function ownEngineer(userId: number) {
 const profile = await prisma.engineerProfile.findFirst({ where: { contributorParty: { claimedByUserId: userId } } });
 if (!profile) throw new Error("Engineer profile not found.");
 return profile;
}
export async function createCommunityVouch(engineerId: number, authorId: number, raw: unknown) {
 const parsed = vouchSchema.parse(raw);
 const { publicNameConsent, ...fields } = parsed;
 const data = { ...fields, publicName: publicNameConsent && fields.publicName ? fields.publicName : null };
 return prisma.$transaction(async tx => {
  const engineer = await tx.engineerProfile.findFirst({ where: { id: engineerId, sellerState: "ACTIVE" }, include: { contributorParty: true } });
  if (!engineer || engineer.contributorParty.claimedByUserId === authorId) throw new Error("You cannot vouch for your own profile.");
  if (await tx.studioVouch.count({ where: { authorId, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 3) throw new Error("You can submit up to three community vouches per day.");
  return tx.studioVouch.create({ data: { engineerProfileId: engineerId, authorId, ...data } });
 }, { isolationLevel: "Serializable" });
}
export async function createShowcase(userId: number, raw: unknown) {
 const data = showcaseSchema.parse(raw), profile = await ownEngineer(userId);
 const artist = await prisma.user.findUnique({ where: { email: data.artistEmail }, select: { id: true, status: true } });
 if (!artist || artist.status !== "ACTIVE") throw new Error("The credited artist needs an active HYMN account to confirm permission.");
 if (artist.id === userId) throw new Error("Ask an independent credited artist to confirm this work.");
 if (await prisma.studioShowcase.count({ where: { engineerProfileId: profile.id } }) >= 20) throw new Error("Your profile can hold up to twenty showcases.");
 const work = await prisma.studioShowcase.create({ data: { engineerProfileId: profile.id, artistId: artist.id, title: data.title, role: data.role, beforeUrl: data.beforeUrl || null, afterUrl: data.afterUrl, releaseUrl: data.releaseUrl || null, breakdown: data.breakdown, rightsConfirmed: true } });
 await prisma.notification.upsert({ where: { eventKey: `studio:credit:${work.id}` }, create: { userId: artist.id, title: "Confirm an engineer credit", body: `${profile.professionalName} would like to showcase ${work.title}. Review the credit and public audio permission.`, type: "account", href: "/dashboard/studio", actionLabel: "Review credit", eventKey: `studio:credit:${work.id}` }, update: {} });
 return work;
}
export async function confirmShowcase(id: number, artistId: number, approve: boolean) {
 const changed = await prisma.studioShowcase.updateMany({ where: { id, artistId, status: { in: ["PENDING", "APPROVED"] } }, data: { artistConfirmedAt: approve ? new Date() : null, status: approve ? "PENDING" : "REJECTED" } });
 if (!changed.count) throw new Error("Credit request not found.");
}
export async function createConsultationSlot(userId: number, startsAt: string) {
 const profile = await ownEngineer(userId), start = new Date(startsAt);
 if (!Number.isFinite(start.getTime()) || start.getTime() < Date.now() + 3600000 || start.getTime() > Date.now() + 60 * 86400000) throw new Error("Choose a slot between one hour and sixty days from now.");
 return prisma.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${profile.id})`;
  if (await tx.studioConsultation.count({ where: { engineerProfileId: profile.id, startsAt: { gt: new Date() }, status: { in: ["AVAILABLE", "BOOKED"] } } }) >= 12) throw new Error("Keep up to twelve upcoming listening slots.");
  if (await tx.studioConsultation.count({ where: { engineerProfileId: profile.id, startsAt: { gte: new Date(start.getTime()-15*60000), lte: new Date(start.getTime()+15*60000) }, status: { not: "CANCELLED" } } })) throw new Error("This slot overlaps another consultation.");
  return tx.studioConsultation.create({ data: { engineerProfileId: profile.id, startsAt: start } });
 });
}
export async function bookConsultation(id: number, userId: number, raw: unknown) {
 const data = z.object({ phone: phoneSchema, note: z.string().trim().min(5).max(500) }).parse(raw);
 return prisma.$transaction(async tx => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${id})`;
  const slot = await tx.studioConsultation.findUnique({ where: { id }, include: { engineerProfile: { include: { contributorParty: { include: { claimedBy: { select: { id: true, name: true, email: true } } } } } }, bookedBy: { select: { id: true, name: true, email: true } } } });
  if (slot?.status === "BOOKED" && slot.bookedById === userId) return slot;
  if (!slot || slot.status !== "AVAILABLE" || slot.startsAt.getTime() <= Date.now() || slot.engineerProfile.sellerState !== "ACTIVE") throw new Error("This slot is no longer available.");
  if (slot.engineerProfile.contributorParty.claimedByUserId === userId) throw new Error("You cannot book your own consultation.");
  if (await tx.studioConsultation.count({ where: { bookedById: userId, status: "BOOKED", startsAt: { gte: new Date() } } }) >= 2) throw new Error("You can hold up to two upcoming consultations.");
  return tx.studioConsultation.update({ where: { id }, data: { bookedById: userId, status: "BOOKED", ...data }, include: { engineerProfile: { include: { contributorParty: { include: { claimedBy: { select: { id: true, name: true, email: true } } } } } }, bookedBy: { select: { id: true, name: true, email: true } } } });
 }, { isolationLevel: "Serializable" });
}
