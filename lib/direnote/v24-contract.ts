import { z } from "zod";

const page = { page: z.number().int().min(1).max(100000).default(1), per_page: z.number().int().min(1).max(100).default(25), order: z.enum(["asc", "desc"]).default("desc") };
const search = z.string().trim().max(200).optional();
const upc = z.string().transform(value => value.replace(/[\s-]/g, "")).pipe(z.string().regex(/^\d{12,14}$/, "Enter a 12–14 digit UPC."));
const id = z.number().int().positive();
const httpsUrl = z.string().url().max(2000).refine(value => { try { return new URL(value).protocol === "https:"; } catch { return false; } }, "Use an HTTPS profile URL.");
const link = z.union([httpsUrl, z.literal(""), z.null()]);
const name = z.string().trim().min(1).max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Invalid date");
const reference = z.object({ search }).strict();
const changed = (value: Record<string, unknown>) => Object.keys(value).length > 1;

/** Provider v2.4 allowlist. Never accept a URL, credentials or arbitrary fields from a browser. */
export const direNoteV24Schemas = {
  list_releases: z.object({ ...page, search, status: z.string().trim().max(40).optional(), type_of_release: z.enum(["Single", "EP", "Album"]).optional(), sort_by: z.enum(["id", "release_date", "name"]).default("id") }).strict(),
  get_smartlink: z.object({ upc }).strict(),
  check_qc_report: z.object({ upc }).strict(),
  withdraw_release: z.object({ upc }).strict(),
  list_artists: z.object({ ...page, search, sort_by: z.enum(["id", "name"]).default("id") }).strict(),
  update_artist: z.object({ artist_id: id, name: name.optional(), spotify_url: link.optional(), apple_url: link.optional(), youtube_url: link.optional(), instagram_url: httpsUrl.optional() }).strict().refine(changed, "Choose at least one field to change."),
  list_songwriters: z.object({ ...page, search, sort_by: z.enum(["id", "name"]).default("id") }).strict(),
  update_songwriter: z.object({ songwriter_id: id, name: name.refine(value => value.split(/\s+/).length >= 2, "Use the full songwriter name.").optional(), ipi: z.union([z.string().regex(/^\d{9,11}$/), z.literal(""), z.null()]).optional(), iprs_member: z.enum(["Yes", "No"]).optional(), instagram_url: link.optional(), x_url: link.optional() }).strict().refine(changed, "Choose at least one field to change."),
  list_payouts: z.object({ ...page, payout_id: id.optional(), status: z.string().trim().max(40).optional(), payment_type: z.string().trim().max(40).optional(), from_date: date.optional(), to_date: date.optional(), sort_by: z.enum(["requested_at", "id", "amount"]).default("requested_at") }).strict().refine(value => !value.from_date || !value.to_date || value.from_date <= value.to_date, "End date must follow start date."),
  list_territories: reference, list_stores: reference, list_genres: reference, list_languages: reference,
  list_instruments: reference, list_contributor_roles: reference, list_video_platforms: reference,
  list_master_collecting_bodies: reference, list_mechanical_societies: reference, list_performance_societies: reference,
} as const;
export type DireNoteV24Action = keyof typeof direNoteV24Schemas;
export const direNoteV24Actions = Object.keys(direNoteV24Schemas) as DireNoteV24Action[];
export const isDireNoteMutation = (action: DireNoteV24Action) => action === "withdraw_release" || action === "update_artist" || action === "update_songwriter";
export const isDireNoteReference = (action: DireNoteV24Action) => action.startsWith("list_") && !["list_releases", "list_artists", "list_songwriters", "list_payouts"].includes(action);

export const direNoteV24Request = z.object({
  action: z.enum(direNoteV24Actions as [DireNoteV24Action, ...DireNoteV24Action[]]),
  payload: z.record(z.string(), z.unknown()).default({}),
  operationId: z.string().uuid().optional(),
  confirmation: z.string().max(200).optional(),
}).strict();
