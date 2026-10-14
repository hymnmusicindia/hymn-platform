import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export async function submitPlaylistTestimonial(userId: number, input: unknown) {
  const value = z.object({ reviewId: z.number().int().positive(), rating: z.number().int().min(1).max(5), quote: z.string().trim().min(20).max(500), consent: z.literal(true) }).parse(input);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422062, ${value.reviewId}::integer)`;
    const review = await tx.playlistReviewRequest.findFirst({ where: { id: value.reviewId, customerId: userId, status: { in: ["SHORTLISTED", "NOT_A_FIT"] }, reviewedAt: { not: null } } });
    if (!review) throw Error("Only your completed service is eligible for a review.");
    if (await tx.auditLog.findFirst({ where: { action: "PLAYLIST_SERVICE_TESTIMONIAL", entity: "playlist_review", entityId: String(value.reviewId) } })) throw Error("You’ve already shared feedback for this service.");
    await tx.auditLog.create({ data: { actorId: userId, actorType: "user", action: "PLAYLIST_SERVICE_TESTIMONIAL", entity: "playlist_review", entityId: String(value.reviewId), metadata: { rating: value.rating, quote: value.quote, publicConsent: true } } });
    return { saved: true };
  });
}

export async function playlistTestimonials() {
  const events = await prisma.auditLog.findMany({ where: { action: { in: ["PLAYLIST_SERVICE_TESTIMONIAL", "PLAYLIST_ARTIST_TESTIMONIAL_APPROVED"] } }, orderBy: { createdAt: "desc" }, take: 30 });
  const subjectId = (row: typeof events[number]) => row.action === "PLAYLIST_SERVICE_TESTIMONIAL" ? row.actorId : (row.metadata as { subjectUserId?: number } | null)?.subjectUserId;
  const users = await prisma.user.findMany({ where: { id: { in: events.flatMap(row => subjectId(row) ? [subjectId(row)!] : []) }, status: "ACTIVE" }, select: { id: true, name: true, avatar: true } });
  return events.flatMap(row => {
    const user = users.find(user => user.id === subjectId(row));
    const value = row.metadata as { rating?: number; quote?: string; publicConsent?: boolean } | null;
    return user && value?.publicConsent && value.quote && value.rating && value.rating >= 1 && value.rating <= 5 ? [{ id: row.id, name: user.name, avatar: user.avatar, rating: value.rating, quote: value.quote, verifiedService: row.action === "PLAYLIST_SERVICE_TESTIMONIAL" }] : [];
  });
}
