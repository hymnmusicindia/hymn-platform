import { z } from "zod";

export const REVIEW_TERMS_VERSION = "playlist-review-2026-10-15-v3";
export const HYMN_REVIEW_FEE_MINOR = 5000;
export const PLAYLIST_CATALOGUE_STATUSES = ["UNDER_REVIEW", "APPROVED", "QUEUED_FOR_DISTRIBUTION", "SUBMITTING_TO_DISTRIBUTOR", "SENT_TO_DISTRIBUTOR", "DISTRIBUTOR_PROCESSING", "SCHEDULED", "PROCESSING", "AWAITING_LIVE_CONFIRMATION", "PARTIALLY_LIVE", "DELIVERED", "SENT", "LIVE", "DISTRIBUTED"] as const;
export function playlistCatalogueStatus(status: string) {
  if (["LIVE", "DISTRIBUTED"].includes(status)) return "Released on HYMN";
  if (status === "UNDER_REVIEW") return "Under review";
  if (status === "APPROVED") return "Approved";
  if (status === "SCHEDULED") return "Scheduled";
  if (["QUEUED_FOR_DISTRIBUTION", "SUBMITTING_TO_DISTRIBUTOR"].includes(status)) return "Preparing delivery";
  return "Sent for distribution";
}
export const EXTERNAL_REVIEW_FEE_MINOR = 8000;
export function reviewFeeMinor(isHymn: boolean, curatorFee: number, verifiedHymnTrack: boolean) {
  return isHymn ? verifiedHymnTrack ? HYMN_REVIEW_FEE_MINOR : EXTERNAL_REVIEW_FEE_MINOR : curatorFee;
}
export const REVIEW_WINDOW_DAYS = 7;
export const REVIEW_NOT_A_FIT_COPY = "Not a fit for this playlist—not a verdict on your music. Every curator has a different audience. Use the feedback below to choose your next step, and keep creating.";
export const playlistUrlSchema = z.string().trim().url().refine(value => {
  let url: URL; try { url = new URL(value); } catch { return false; } return url.protocol === "https:" && url.hostname === "open.spotify.com" && /^\/playlist\/[a-zA-Z0-9]{22}\/?$/.test(url.pathname) && !url.username && !url.password;
}, "Use a public Spotify playlist link.");
export const trackUrlSchema = z.string().trim().url().refine(value => {
  let url: URL; try { url = new URL(value); } catch { return false; } return url.protocol === "https:" && url.hostname === "open.spotify.com" && /^\/(?:intl-[a-z]+\/)?track\/[a-zA-Z0-9]{22}\/?$/.test(url.pathname) && !url.username && !url.password;
}, "Use a Spotify track link, not an album or artist link.");
export const playlistProfileSchema = z.object({
  coverUrl: z.string().trim().max(500).regex(/^\/api\/public-uploads\/site\/playlists\/\d+\/[a-f0-9-]+\.webp$/, "Upload a playlist cover first."),
  moods: z.string().trim().min(3).max(120),
  languages: z.string().trim().min(2).max(120),
  audience: z.string().trim().min(10).max(240),
});
export const listingSchema = z.object({ name: z.string().trim().min(3).max(90), playlistUrl: playlistUrlSchema, description: z.string().trim().min(30).max(800), genres: z.string().trim().min(3).max(160), feeRupees: z.number().int().min(10).max(10000), capacity: z.number().int().min(1).max(100), ownershipConfirmed: z.literal(true), termsVersion: z.literal(REVIEW_TERMS_VERSION) }).extend(playlistProfileSchema.shape);
export const reviewSubmissionSchema = z.object({ trackId: z.number().int().positive().optional(), listingId: z.number().int().positive(), requestKey: z.string().uuid(), trackTitle: z.string().trim().min(1).max(200), artistName: z.string().trim().min(1).max(120), trackUrl: z.union([trackUrlSchema, z.literal("")]), pitch: z.string().trim().min(20).max(1500), termsVersion: z.literal(REVIEW_TERMS_VERSION), accepted: z.literal(true) }).refine(value => Boolean(value.trackId) || trackUrlSchema.safeParse(value.trackUrl).success, { message: "External tracks need a Spotify track link.", path: ["trackUrl"] });
export const reviewDecisionSchema = z.object({ status: z.enum(["SHORTLISTED", "NOT_A_FIT"]), remark: z.string().trim().min(30, "Please leave specific, constructive feedback (at least 30 characters).").max(2000), nextStep: z.string().trim().min(10, "Suggest a practical next step for the artist.").max(600) });
export function reviewDeadline(paidAt: Date) { return new Date(paidAt.getTime() + REVIEW_WINDOW_DAYS * 86400000); }
export function mayReview(row: { status: string; dueAt: Date | null }, now = new Date()) { return row.status === "IN_REVIEW" && Boolean(row.dueAt && row.dueAt > now); }
