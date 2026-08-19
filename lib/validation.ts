import { z } from "zod";

export const googleAuthSchema = z.object({
  credential: z.string().min(1),
  referralCode: z.string().optional(),
  expectedRole: z.enum(["customer", "producer"]).optional(),
  loginContext: z.enum(["admin"]).optional()
});

export const mockLoginSchema = z.object({
  role: z.enum(["customer", "producer"])
});

export const contactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  serviceInterest: z.string().optional(),
  message: z.string().min(10)
});

export const partnershipLeadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  company: z.string().optional(),
  collaborationType: z.string().min(2),
  message: z.string().min(10)
});

export const producerApplicationSchema = z.object({
  artistName: z.string().min(2),
  genreFocus: z.string().min(2),
  beatCatalogSize: z.coerce.number().int().min(1),
  experience: z.string().min(10),
  links: z.string().min(3),
  message: z.string().min(10),
  instagram: z.string().optional(),
  youtube: z.string().optional(),
  soundcloud: z.string().optional(),
  spotify: z.string().optional(),
  pricing: z.string().optional(),
  sampleBeats: z.array(z.string()).optional(),
  yearsExperience: z.coerce.number().int().min(0).optional(),
  bio: z.string().optional()
});

export const producerApplicationReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().optional()
});

export const userRoleUpdateSchema = z.object({
  role: z.enum(["customer", "producer", "admin"])
});

const spotifyArtistUrlPattern = /^(?:https?:\/\/)?open\.spotify\.com\/artist\/[A-Za-z0-9]+(?:[/?#].*)?$|^spotify:artist:[A-Za-z0-9]+$/i;
const instagramProfilePattern = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9._]+\/?(?:[?#].*)?$|^@[A-Za-z0-9._]+$/i;
const appleArtistUrlPattern = /^(?:https?:\/\/)?music\.apple\.com\/[a-z]{2}\/artist\/[^/]+\/\d+(?:[/?#].*)?$/i;

export const artistProfileCreateSchema = z.object({
  name: z.string().min(1),
  hasLiveMusic: z.boolean().optional().default(true),
  spotifyUrl: z.string().min(1).refine((value) => spotifyArtistUrlPattern.test(value.trim()), { message: "Please paste a valid Spotify artist profile link." }),
  appleUrl: z.string().optional().refine((value) => !value || appleArtistUrlPattern.test(value.trim()), { message: "Please paste a valid Apple Music artist profile link." }),
  instagramUrl: z.string().min(1).refine((value) => instagramProfilePattern.test(value.trim()), { message: "Instagram profile link is required for artist verification." }),
  youtubeUrl: z.string().url().optional().or(z.literal("")),
  spotifyArtistId: z.string().optional(),
  appleArtistId: z.string().optional(),
  imageUrl: z.string().optional(),
  followers: z.number().int().nonnegative().nullable().optional(),
  confirmedSpotifyName: z.string().optional()
});

export const spotifySearchSchema = z.object({ q: z.string().min(1) });
export const spotifyResolveSchema = z.object({ spotifyUrl: z.string().min(1) });

export const orderItemSchema = z.object({
  beatId: z.number().int().positive(),
  licenseType: z.enum(["basic", "premium", "exclusive"]),
  price: z.number().positive()
});

export const paymentCreateSchema = z.object({ items: z.array(orderItemSchema).min(1) });
export const paymentVerifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  items: z.array(orderItemSchema).min(1)
});

export const artistProfileUpdateSchema = artistProfileCreateSchema.partial().extend({
  instagramUrl: z.string().min(1).refine((value) => instagramProfilePattern.test(value.trim()), { message: "Instagram profile link is required for artist verification." }).optional()
});

export function normalizeInstagramUrl(value: string) {
  const normalized = value.trim();
  if (normalized.startsWith("@")) return `https://instagram.com/${normalized.slice(1)}`;
  if (!/^https?:\/\//i.test(normalized)) return `https://${normalized}`;
  return normalized;
}

export const checkoutItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("beat"),
    beatId: z.number().int().positive(),
    licenseType: z.enum(["basic", "exclusive"])
  }),
  z.object({
    type: z.literal("distribution"),
    plan: z.enum(["one_time", "half_yearly", "yearly", "yearly_plus"]),
    trackCount: z.number().int().min(1).max(100).default(1),
    platforms: z.array(z.string().min(1)).default(["Spotify", "Apple Music"]),
    youtubeContentIdEnabled: z.boolean().optional()
  })
]);

export const checkoutQuoteSchema = z.object({
  items: z.array(checkoutItemSchema).min(1),
  couponCode: z.string().trim().max(64).optional(),
  useReferralCredits: z.boolean().default(false)
});

export const checkoutCreateOrderSchema = checkoutQuoteSchema;

export const checkoutVerifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1)
});

export const referralTrackSchema = z.object({
  referralCode: z.string().trim().min(2).max(64)
});

const contributorSchema = z.object({
  role: z.enum(["songwriter", "composer", "producer"]),
  legalName: z.string().min(1),
  artistName: z.string().optional(),
  ipi: z.string().optional(),
  iprsMember: z.boolean().optional(),
  instagramUrl: z.string().optional(),
  xUrl: z.string().optional()
});

export const distributionTrackSchema = z.object({
  trackTitle: z.string().min(1),
  version: z.string().optional(),
  trackNumber: z.number().int().min(1),
  primaryArtist: z.string().min(1),
  featuredArtists: z.string().optional(),
  additionalPrimaryArtists: z.string().optional(),
  songwriters: z.string().min(1),
  composers: z.string().min(1),
  producers: z.string().min(1),
  contributors: z.array(contributorSchema).optional(),
  isrc: z.string().optional(),
  isCover: z.boolean(),
  originalArtist: z.string().optional(),
  originalTrackLink: z.string().optional(),
  coverLicenseConfirmed: z.boolean(),
  coverLicenseFileKey: z.string().optional(),
  existingCoverLicenseConfirmed: z.boolean().optional(),
  uploadedCoverLicenseUrl: z.string().optional(),
  audioFileKey: z.string().min(1),
  existingAudioUrl: z.string().optional(),
  uploadedAudioUrl: z.string().optional(),
  duration: z.string().min(1),
  bpm: z.number().nullable().optional(),
  musicalKey: z.string().optional(),
  explicitContent: z.boolean(),
  dolbyAtmos: z.boolean(),
  metadata: z.record(z.unknown()).optional(),
  artistProfileIds: z.array(z.number().int().positive()).optional(),
  featuredArtistProfileIds: z.array(z.number().int().positive()).optional(),
  remixerProfileIds: z.array(z.number().int().positive()).optional()
});

export const distributionMetadataSchema = z.object({
  artistName: z.string().min(1),
  releaseTitle: z.string().optional(),
  releaseType: z.enum(["single", "ep", "album"]),
  releaseDate: z.string().min(1),
  originalReleaseDate: z.string().optional(),
  recordLabelName: z.string().min(1),
  primaryGenre: z.string().min(1),
  secondaryGenre: z.string().min(1),
  language: z.string().min(1),
  mood: z.string().trim().min(1, "Please select a mood for this release."),
  territory: z.string().min(1),
  upcCode: z.string().nullable().optional(),
  releasePreviouslyReleased: z.boolean().optional(),
  releaseTiming: z.string().min(1),
  platforms: z.array(z.string()).min(1),
  youtubeContentIdEnabled: z.boolean().optional(),
  youtubeContentIdChannelUrl: z.string().nullable().optional(),
  monetisationAccepted: z.boolean().optional(),
  monetisationClauses: z.record(z.boolean()).optional(),
  copyrightOwner: z.string().min(1),
  labelName: z.string().nullable().optional(),
  publishingRights: z.string().nullable().optional(),
  legal: z.object({
    ownershipConfirmation: z.literal(true),
    noInfringement: z.literal(true),
    collaboratorsCredited: z.literal(true),
    platformGuidelines: z.literal(true),
    hymnNotLiable: z.literal(true),
    termsAccepted: z.literal(true),
    falseMetadataAcknowledged: z.literal(true),
    fraudWarningAccepted: z.literal(true)
  }),
  paymentModel: z.enum(["one_time", "subscription"]),
  plan: z.enum(["one_time", "half_yearly", "yearly", "yearly_plus"]),
  artworkFileKey: z.string().min(1),
  existingArtworkUrl: z.string().optional(),
  uploadedArtworkUrl: z.string().optional(),
  tracks: z.array(distributionTrackSchema).min(1)
});

export const distributionEditMetadataSchema = distributionMetadataSchema.extend({
  editReleaseId: z.number().int().positive()
});

export const distributionOrderCreateSchema = z.object({
  plan: z.enum(["one_time", "half_yearly", "yearly", "yearly_plus"]),
  paymentModel: z.enum(["one_time", "subscription"]),
  trackCount: z.number().int().min(1),
  releaseType: z.enum(["single", "ep", "album"]),
  platforms: z.array(z.string().min(1)).min(1),
  youtubeContentIdEnabled: z.boolean().optional()
});

export const distributionSubmitSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  metadata: distributionMetadataSchema
});

export const distributionEditSchema = z.object({
  metadata: distributionEditMetadataSchema
});

export const adminStatusSchema = z.object({
  status: z.enum(["draft", "submitted", "in_queue", "under_review", "changes_requested", "approved", "queued_for_distribution", "sent_to_distributor", "scheduled", "processing", "awaiting_live_confirmation", "partially_live", "delivered", "rejected", "sent", "live", "failed"]),
  note: z.string().optional(),
  reason: z.string().trim().optional(),
  issueType: z.enum(["metadata", "artwork", "audio", "rights_ownership", "contributor_credits", "release_date", "genre_language", "artist_profile", "license_ai_proof", "platform_destination", "other"]).optional(),
  severity: z.enum(["minor_correction", "required_correction", "critical_issue"]).optional(),
  fields: z.array(z.object({ field: z.string().min(1), label: z.string().min(1), note: z.string().optional() })).optional(),
  adminInternalNote: z.string().trim().optional()
}).superRefine((payload, context) => {
  if (payload.status !== "rejected" && payload.status !== "changes_requested") return;
  if (!payload.reason) context.addIssue({ code: z.ZodIssueCode.custom, path: ["reason"], message: "A user-facing reason is required." });
  if (!payload.issueType) context.addIssue({ code: z.ZodIssueCode.custom, path: ["issueType"], message: "An issue type is required." });
  if (payload.issueType === "metadata" && !payload.fields?.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["fields"], message: "Select at least one metadata field." });
});

export const beatMutationSchema = z.object({
  title: z.string().min(2).optional(),
  bpm: z.coerce.number().int().positive().optional(),
  genre: z.string().min(2).optional(),
  mood: z.string().min(2).optional(),
  price: z.coerce.number().positive().optional(),
  enabled: z.boolean().optional()
});



export const userLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(["customer", "producer"]).optional()
});

export const userSignupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["customer", "producer"]),
  referralCode: z.string().optional()
});

export const workspaceRoleSwitchSchema = z.object({
  role: z.enum(["customer", "producer"])
});

export const adminLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const spotifyPlaylistUrlPattern = /^https?:\/\/(?:open\.)?spotify\.com\/playlist\/[A-Za-z0-9]+(?:[/?#].*)?$/i;

export const timedPlaylistCreateSchema = z.object({
  spotifyUrl: z.string().min(1),
  playlistName: z.string().min(2),
  playlistUrl: z.string().min(1).refine((value) => spotifyPlaylistUrlPattern.test(value.trim()), {
    message: 'Choose a valid Spotify playlist link.'
  }),
  startAt: z.string().min(1),
  endAt: z.string().min(1)
});

export const timedPlaylistMutationSchema = z.object({
  id: z.coerce.number().int().positive(),
  action: z.enum(["extend", "remove"]),
  endAt: z.string().min(1).optional()
});

// vercel trigger

// vercel trigger 3

// vercel trigger
// vercel trigger 4
