export type ReleaseStatus = "draft" | "awaiting_payment" | "submitted" | "in_queue" | "in_qc_queue" | "under_review" | "changes_requested" | "resubmitted" | "approved" | "queued_for_distribution" | "submitting_to_distributor" | "sent_to_distributor" | "distributor_processing" | "distributor_changes_required" | "scheduled" | "processing" | "awaiting_live_confirmation" | "partially_live" | "delivered" | "sent" | "live" | "delivery_failed" | "takedown_requested" | "takedown_processing" | "taken_down" | "archived" | "rejected" | "failed";

export type LicenseType = "mp3" | "wav" | "stems" | "exclusive" | "general" | "basic" | "premium";

export type UserRole = "customer" | "producer" | "admin";

export type ProducerApplicationStatus = "pending" | "approved" | "rejected";

export type SubscriptionPlan = "basic" | "pro" | "elite" | "one_time" | "one_time" | "half_yearly" | "yearly" | "yearly_plus";

export type DistributionPlan = "one_time" | "half_yearly" | "yearly" | "yearly_plus";

export type DistributionQueueStage = "draft_submitted" | "quality_check" | "awaiting_approval" | "approved" | "sent_to_direnote" | "processing" | "delivered" | "completed" | "rejected";

export type TimedPlaylistTrackStatus = "active" | "expired";

export type TimedPlaylistModuleView = "dashboard" | "add-track" | "active-tracks" | "expired-tracks";

export type NotificationType = "release" | "beat" | "order" | "payout" | "account" | "system";

export type NotificationPriority = "low" | "normal" | "high";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface Notification {
  id: number;
  userId: number;
  title: string;
  body: string;
  type: NotificationType;
  href?: string | null;
  actionLabel?: string | null;
  priority: NotificationPriority;
  eventKey?: string | null;
  metadata?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface SupportTicket {
  id: number;
  userId: number;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  category?: string;
  priority?: string;
  relatedReleaseId?: number | null;
  relatedPurchaseId?: number | null;
  relatedPayoutId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContributorCredit {
  role: "songwriter" | "composer" | "producer";
  legalName: string;
  artistName?: string;
  ipi?: string;
  iprsMember?: boolean;
  instagramUrl?: string;
  xUrl?: string;
}

export interface ArtistProfile {
  id: number;
  userId: number;
  name: string;
  spotifyArtistId?: string | null;
  spotifyUrl?: string | null;
  appleArtistId?: string | null;
  appleUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  imageUrl?: string | null;
  followers?: number | null;
  isLinked: boolean;
  isPrimary?: boolean;
  isProducer?: boolean;
  producerLegalName?: string | null;
  archivedAt?: string | null;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SpotifyArtistResult {
  id: string;
  name: string;
  imageUrl?: string | null;
  followers?: number | null;
  spotifyUrl: string;
}

export interface SpotifyTrackSearchResult {
  id: string;
  name: string;
  artistName: string;
  albumName?: string | null;
  durationMs?: number | null;
  imageUrl?: string | null;
  spotifyUrl: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  googleId: string;
  avatarUrl?: string | null;
  passwordHash?: string | null;
  role: UserRole;
  status?: "active" | "paused" | "under_review" | "suspended" | "deletion_scheduled" | "banned";
  statusReason?: string | null;
  statusChangedAt?: string | null;
  deletionScheduledAt?: string | null;
  appealRequestedAt?: string | null;
  appealMessage?: string | null;
  referralCode: string;
  referralCredits: number;
  referredBy?: number | null;
  firstPaymentRewarded?: boolean;
  createdAt: string;
  mobile?: string | null;
  contactEmail?: string | null;
  dateOfBirth?: string | null;
  preferredLanguage?: string;
  onboardingPurpose?: string | null;
  onboardingUserType?: string | null;
  referralSource?: string | null;
  onboardingCompletedAt?: string | null;
}

export interface ReleaseTrack {
  id: number;
  releaseId: number;
  trackTitle: string;
  version?: string;
  trackNumber: number;
  primaryArtist: string;
  featuredArtists?: string;
  additionalPrimaryArtists?: string;
  songwriters: string;
  composers: string;
  producers: string;
  isrc?: string;
  isCover: boolean;
  originalArtist?: string;
  originalTrackLink?: string;
  coverLicenseConfirmed: boolean;
  coverLicenseUrl?: string;
  audioUrl: string;
  distributorStatus?: string | null;
  duration: string;
  bpm?: number | null;
  musicalKey?: string;
  explicitContent: boolean;
  lyrics?: string | null;
  trackLyrics?: string | null;
  previouslyReleased?: boolean;
  metadata?: Record<string, unknown> | null;
  dolbyAtmos: boolean;
  contributors?: ContributorCredit[];
  createdAt: string;
}

export interface Release {
  id: number;
  userId: number;
  artistName: string;
  trackName: string;
  releaseTitle: string;
  releaseType: "single" | "ep" | "album";
  audioUrl: string;
  artworkUrl: string;
  releaseDate: string;
  originalReleaseDate?: string | null;
  labelName?: string | null;
  primaryGenre?: string | null;
  secondaryGenre?: string | null;
  genre?: string | null;
  mood?: string | null;
  language: string;
  platforms: string[];
  youtubeContentIdEnabled?: boolean;
  youtubeContentIdChannelUrl?: string;
  monetisationAccepted?: boolean;
  monetisationClauses?: Record<string, boolean>;
  territory?: string | null;
  upcCode?: string | null;
  releasePreviouslyReleased?: boolean;
  distributorReleaseId?: string | null;
  direNoteStatus?: string | null;
  direNoteLastSyncedAt?: string | null;
  direNoteLastAttemptedAt?: string | null;
  direNoteSyncError?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  distributedAt?: string | null;
  liveAt?: string | null;
  releaseTiming?: string | null;
  ownershipConfirmed?: boolean;
  noUnauthorizedSamples?: boolean;
  collaboratorsCredited?: boolean;
  platformCompliant?: boolean;
  hymnNotLiable?: boolean;
  agreedToTerms?: boolean;
  falseMetadataAcknowledged?: boolean;
  copyrightOwner?: string | null;
  labelDisplayName?: string | null;
  publishingRights?: string | null;
  analytics?: ReleaseAnalytics;
  paymentModel?: "one_time" | "subscription";
  paymentStatus?: "pending" | "paid";
  distributionPlan?: SubscriptionPlan;
  contentType?: "original_exclusive_licensed" | "ai_generated" | "non_exclusive_licensed" | string;
  presaveSpotify?: string | null;
  presaveApple?: string | null;
  exclusiveSpotify?: string | null;
  exclusiveApple?: string | null;
  suno_receipt_url?: string | null;
  sunoReceiptUrl?: string | null;
  sunoLink?: string | null;
  license_receipt_url?: string | null;
  licenseReceiptUrl?: string | null;
  licenseDocumentUrl?: string | null;
  beatLicenseUrl?: string | null;
  adminInstructions?: string | null;
  reviewNote?: string | null;
  rejectionReason?: string | null;
  correctionReason?: string | null;
  reviewIssues?: ReleaseReviewIssues | null;
  adminInternalNote?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  ownerEmail?: string | null;
  artistLinks?: Record<string, {
    spotify_url?: string;
    spotifyUrl?: string;
    apple_url?: string;
    appleUrl?: string;
    youtube_url?: string;
    youtubeUrl?: string;
    instagram_url?: string;
    instagramUrl?: string;
  }>;
  metadata?: Record<string, unknown> | null;
  draftCompletionPercent?: number;
  lastEditedAt?: string | null;
  missingFields?: string[];
  distributionStores?: UserStoreStatus[];
  queuePosition?: number | null;
  estimatedReviewTime?: string | null;
  status: ReleaseStatus;
  tracks?: ReleaseTrack[];
  createdAt: string;
}

export type StoreStatus = "Live" | "In Review" | "Pending" | "Denied" | "Not Available" | "Content ID Enabled" | "Content ID Denied" | "Takedown Requested" | "Paused" | "Removed";

export interface UserStoreStatus {
  platform: string;
  status: StoreStatus;
  reason?: string | null;
  userFacingNote?: string | null;
  updatedAt?: string | null;
}

export interface AdminStoreStatus extends UserStoreStatus {
  internalNote?: string | null;
  updatedBy?: number | null;
  updatedByLabel?: string | null;
}

export interface StoreStatusHistoryEntry extends AdminStoreStatus {
  id: string;
  oldStatus?: StoreStatus | null;
}

export type ReleaseReviewIssueType = "metadata" | "artwork" | "audio" | "rights_ownership" | "contributor_credits" | "release_date" | "genre_language" | "artist_profile" | "license_ai_proof" | "platform_destination" | "other";
export type ReleaseReviewSeverity = "minor_correction" | "required_correction" | "critical_issue";
export interface ReleaseReviewIssues {
  type: ReleaseReviewIssueType;
  severity: ReleaseReviewSeverity;
  fields: Array<{ field: string; label: string; note?: string }>;
}

export type AnalyticsWindow = "7d" | "30d" | "all";

export interface AnalyticsPoint {
  date: string;
  value: number;
}

export interface ReleaseAnalytics {
  streams_total: number;
  revenue_total: number;
  platforms: Record<string, number>;
  countries: Record<string, number>;
  daily_streams: AnalyticsPoint[];
  daily_revenue: AnalyticsPoint[];
}

export interface AnalyticsMetric {
  label: string;
  value: number;
  format: "number" | "currency" | "percent";
  detail: string;
  delta?: number;
}

export interface AnalyticsWindowSeries {
  label: string;
  streams: AnalyticsPoint[];
  revenue: AnalyticsPoint[];
}

export interface AnalyticsCountryStat {
  country: string;
  streams: number;
  percent: number;
  x: number;
  y: number;
}

export interface AnalyticsPlatformStat {
  platform: string;
  streams: number;
  revenue: number;
  percent: number;
}

export interface AnalyticsReleaseRow {
  id: number;
  trackName: string;
  streams: number;
  revenue: number;
  topCountry: string;
  status: ReleaseStatus;
  statusLabel: string;
  updatedAt: string;
}

export interface AnalyticsInsight {
  title: string;
  body: string;
  tone: "success" | "neutral" | "warning";
}

export interface DistributionQueueSummary {
  currentlyReviewing: number;
  nextBatchIn: string;
  averageApprovalTime: string;
  pendingQueue: number;
}

export interface DistributionOrder {
  id: number;
  userId: number;
  releaseId?: number | null;
  plan: SubscriptionPlan;
  amount: number;
  razorpayOrderId: string;
  razorpayPaymentId?: string | null;
  paymentStatus: "created" | "paid" | "failed";
  createdAt: string;
}

export interface Subscription {
  id: number;
  userId: number;
  plan: DistributionPlan;
  planName?: string;
  purchasedAt?: string;
  expiryDate: string;
  status: "created" | "authenticated" | "active" | "pending" | "halted" | "paused" | "resumed" | "completed" | "expired" | "cancelled";
  releasesUsed: number;
  releaseLimit: number | null;
  artistLimit: number;
  availableFeatures?: string[];
  daysRemaining: number;
  autoRenewal?: boolean;
  nextRenewalDate?: string | null;
  razorpaySubscriptionId?: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  startedAt?: string | null;
  cancelledAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  amount?: number;
  currency?: string;
  billingInterval?: string;
  billingHistory?: Array<{ id: number; paymentId: string; invoiceId?: string | null; amount: number; currency: string; status: string; billingPeriodStart?: string; billingPeriodEnd?: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ArtistCard {
  id: number;
  userId: number;
  artistName: string;
  spotifyProfileUrl?: string | null;
  appleMusicProfileUrl?: string | null;
  role?: string;
  isProducer?: boolean;
  producerLegalName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BeatPurchase {
  id: number;
  userId: number;
  beatId: number;
  licenseType: LicenseType;
  purchasedAt: string;
  licenseUploadedAt?: string | null;
  licenseUrl?: string | null;
  releaseId?: number | null;
  paymentId?: string | null;
  hasAccess: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DistributionQueueLog {
  id: number;
  queueEntryId: number;
  stage: DistributionQueueStage;
  stageStartTime: string;
  stageEndTime?: string | null;
  operatorId?: number | null;
  notes?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface DistributionQueueEntry {
  id: number;
  releaseId: number;
  currentStage: DistributionQueueStage;
  qualityCheckNotes?: string | null;
  approvalNotes?: string | null;
  direnoteRequestId?: string | null;
  direnoteResponse?: Record<string, any> | null;
  submissionId?: string | null;
  apiErrorMessage?: string | null;
  stageHistory?: DistributionQueueLog[] | null;
  operatorId?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Beat {
  id: number;
  producerId: number;
  producerName?: string;
  title: string;
  bpm: number;
  genre: string;
  mood: string;
  keySignature?: string;
  price: number;
  generalPrice?: number;
  stemPrice?: number;
  exclusivePrice?: number;
  description?: string;
  subgenre?: string;
  tags?: string[];
  previewUrl?: string;
  sampleDeclaration?: "NO_UNCONTROLLED_SAMPLES" | "CONTAINS_UNCONTROLLED_SAMPLES";
  sampleDisclosure?: string | null;
  generalMaxCommercialReleases?: number;
  generalStreamingLimit?: number | null;
  generalVideoLimit?: number | null;
  generalPerformanceRights?: boolean;
  generalMonetizationAllowed?: boolean;
  generalCreditRequired?: boolean;
  generalContentIdPolicy?: string;
  generalTermDurationMonths?: number | null;
  generalTerritory?: string;
  exclusiveLegalMode?: "EXCLUSIVE_LICENSE" | "RIGHTS_ASSIGNMENT";
  generalLicensesSold?: number;
  exclusiveReservationExpiresAt?: string | null;
  fileUrl: string;
  artworkUrl?: string;
  enabled: boolean;
  status?: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "CHANGES_REQUESTED" | "SUSPENDED" | "EXCLUSIVE_RESERVED" | "EXCLUSIVELY_SOLD" | "ARCHIVED" | string;
  reviewIssues?: { reason?: string; issues?: Array<{ field: string; message: string }> } | null;
  createdAt: string;
}

export interface TimedPlaylistTrack {
  id: number;
  trackName: string;
  artistName: string;
  spotifyUrl: string;
  spotifyTrackId: string;
  playlistName: string;
  playlistUrl?: string | null;
  startAt: string;
  endAt: string;
  status: TimedPlaylistTrackStatus;
  createdAt: string;
  updatedAt: string;
  expiredAt?: string | null;
  removedAt?: string | null;
}

export interface TimedPlaylistSummary {
  activeCount: number;
  expiredCount: number;
  playlistCount: number;
  nextExpiryAt: string | null;
}

export interface TimedPlaylistDashboard {
  summary: TimedPlaylistSummary;
  playlists: string[];
  activeTracks: TimedPlaylistTrack[];
  expiredTracks: TimedPlaylistTrack[];
}

export interface SpotifyAdminConnectionRecord {
  id: number;
  spotifyUserId: string;
  displayName: string;
  refreshToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpotifyAdminConnectionStatus {
  connected: boolean;
  spotifyUserId: string | null;
  displayName: string | null;
  connectedAt: string | null;
}

export interface OrderItem {
  beatId: number;
  beatTitle?: string;
  producerId?: number;
  producerName?: string;
  licenseType: LicenseType;
  price: number;
  licenseUrl?: string | null;
  downloadUrl?: string | null;
}

export interface Order {
  id: number;
  userId: number;
  buyerName?: string;
  buyerEmail?: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  productId?: string | null;
  originalPrice?: number;
  discountApplied?: number;
  referralCreditsUsed?: number;
  finalAmount?: number;
  couponCode?: string | null;
  amount: number;
  paymentStatus: "created" | "paid" | "failed";
  items: OrderItem[];
  createdAt: string;
}

export type DiscountType = "flat" | "percentage";

export interface Coupon {
  id: number;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  expiryDate?: string | null;
  usageLimit?: number | null;
  perUserLimit: number;
  active: boolean;
  createdAt: string;
}

export interface ReferralActivity {
  id: number;
  userId?: number;
  referredUserId?: number | null;
  referralCode?: string;
  signupEmail?: string;
  person?: string;
  status: "signed_up" | "rewarded" | "ATTRIBUTED" | "REGISTERED" | "PENDING" | "QUALIFIED" | "REWARDED" | "REVERSED" | "REJECTED";
  purchaseAmount?: number;
  earnings: number;
  createdAt: string;
  rewardedAt?: string | null;
}

export interface ReferralDashboard {
  referralCode: string;
  referralLink: string;
  availableCredit: number;
  referrerReward: number;
  referredReward: number;
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  totalCreditsEarned: number;
  activities: ReferralActivity[];
  creditHistory: Array<{ id: number; type: string; direction: string; amount: number; description: string; createdAt: string }>;
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  serviceInterest?: string;
  message: string;
  createdAt: string;
}

export interface PartnershipLead {
  id: number;
  name: string;
  email: string;
  company?: string;
  collaborationType: string;
  message: string;
  createdAt: string;
}

export interface AdminNote {
  id: number;
  releaseId: number;
  note: string;
  createdAt: string;
}

export interface ProducerApplication {
  id: number;
  userId: number;
  name: string;
  email: string;
  artistName: string;
  genreFocus: string;
  beatCatalogSize: number;
  experience: string;
  links: string;
  message: string;
  status: ProducerApplicationStatus;
  reviewedBy?: number | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt: string;
}

export interface ProducerProfile {
  id: number;
  userId: number;
  slug: string;
  name: string;
  description: string;
  specialty: string;
  imageUrl?: string | null;
  coverPhotoUrl?: string | null;
  avatarUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  spotifyUrl?: string | null;
  websiteUrl?: string | null;
  tags?: string[];
  location?: string | null;
  status?: "pending_setup" | "active" | "suspended" | "disabled" | string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSettings {
  homeHeroImageUrl?: string | null;
}

export interface ProducerEarning {
  producerId: number;
  producerName: string;
  totalSales: number;
  totalRevenue: number;
  beatsSold: number;
}

export interface AnalyticsSummary {
  state: "verified" | "empty" | "error";
  emptyReason?: "no_verified_data" | "period_unavailable";
  errorMessage?: string;
  dataSource: string | null;
  statementPeriod: string | null;
  importedAt: string | null;
  isVerified: boolean;
  role: UserRole;
  headline: string;
  updatedAt: string;
  metrics: AnalyticsMetric[];
  growth: {
    weekly: number;
    monthly: number;
    weeklyLabel: string;
    monthlyLabel: string;
  };
  series: Record<AnalyticsWindow, AnalyticsWindowSeries>;
  countryBreakdown: AnalyticsCountryStat[];
  platformBreakdown: AnalyticsPlatformStat[];
  revenueBreakdown: AnalyticsPlatformStat[];
  insights: AnalyticsInsight[];
  releaseRows: AnalyticsReleaseRow[];
  selectedCountry: string;
}

export interface SessionPayload {
  sub: number;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string | null;
}

export interface AdminSessionPayload {
  username: string;
  role: "admin";
  sid?: string;
}










export interface DistributionLog {
  id: number;
  releaseId: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  warnings?: string[] | null;
  errors?: string[] | null;
  success: boolean;
  createdAt: string;
}

export interface ReleaseAuditLog {
  id: number;
  releaseId: number;
  userId?: number | null;
  action: string;
  details?: unknown;
  createdAt: string;
}

// trigger vercel deploy

// vercel trigger

// vercel trigger
// vercel trigger 7
// vercel trigger 9
