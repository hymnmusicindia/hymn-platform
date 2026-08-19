export type ReleaseStatus =
  | "draft"
  | "submitted"
  | "in_queue"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "queued_for_distribution"
  | "sent"
  | "sent_to_distributor"
  | "processing"
  | "delivered"
  | "live"
  | "rejected"
  | "failed";

export type LicenseType = "basic" | "premium" | "exclusive";

export type UserRole = "customer" | "producer" | "admin";

export type ProducerApplicationStatus = "pending" | "approved" | "rejected";

export type SubscriptionPlan = "basic" | "pro" | "elite" | "pay_per_release";

export type TimedPlaylistTrackStatus = "active" | "expired";

export type TimedPlaylistModuleView = "dashboard" | "add-track" | "active-tracks" | "expired-tracks";

export interface ContributorCredit {
  role: "songwriter" | "composer" | "producer";
  legalName: string;
  artistName?: string;
}

export interface ArtistProfile {
  id: number;
  userId: number;
  name: string;
  spotifyArtistId?: string | null;
  spotifyUrl?: string | null;
  appleArtistId?: string | null;
  appleUrl?: string | null;
  imageUrl?: string | null;
  followers?: number | null;
  isLinked: boolean;
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
  passwordHash?: string | null;
  role: UserRole;
  referralCode: string;
  referralCredits: number;
  referredBy?: number | null;
  firstPaymentRewarded?: boolean;
  createdAt: string;
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
  distributorReleaseId?: string | null;
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
  queuePosition?: number | null;
  estimatedReviewTime?: string | null;
  status: ReleaseStatus;
  tracks?: ReleaseTrack[];
  createdAt: string;
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

export type AnalyticsWindow = "7d" | "30d" | "all";

export interface AnalyticsPoint {
  date: string;
  value: number;
}

export interface ReleaseAnalytics {
  streams_total: number;
  revenue_total: number;
  platforms: {
    spotify: number;
    apple: number;
    youtube: number;
  };
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
  plan: SubscriptionPlan;
  expiry: string;
  releasesUsed: number;
  releaseLimit: number | null;
  createdAt: string;
}

export interface Beat {
  id: number;
  producerId: number;
  producerName?: string;
  title: string;
  bpm: number;
  genre: string;
  mood: string;
  price: number;
  audioPreviewUrl: string;
  fileUrl: string;
  artworkUrl?: string;
  enabled: boolean;
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
  userId: number;
  referredUserId?: number | null;
  referralCode: string;
  signupEmail: string;
  status: "signed_up" | "rewarded";
  purchaseAmount: number;
  earnings: number;
  createdAt: string;
  rewardedAt?: string | null;
}

export interface ReferralDashboard {
  referralCode: string;
  referralLink: string;
  referralCredits: number;
  earnPerReferral: number;
  friendDiscount: number;
  totalReferrals: number;
  successfulReferrals: number;
  totalCreditsEarned: number;
  nextMilestone: {
    referrals: number;
    bonus: number;
    progress: number;
  } | null;
  campaignEndsAt: string;
  socialProofCount: number;
  activities: ReferralActivity[];
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
  slug: string;
  name: string;
  description: string;
  specialty: string;
  imageUrl?: string | null;
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
}








