import mysql from "mysql2/promise";
import { DistributionLog, DistributionOrder, DistributionQueueSummary, Release, ReleaseAuditLog, ReleaseStatus, ReleaseTrack, Subscription, SubscriptionPlan } from "@/lib/types";
import { getTrackPricingQuote, getUgcAddonPrice } from "@/lib/distribution-pricing";
import { sampleReleases } from "@/lib/site";

type DistributionState = {
  releases: Release[];
  subscriptions: Subscription[];
  orders: DistributionOrder[];
  distributionLogs: DistributionLog[];
  auditLogs: ReleaseAuditLog[];
};

const globalState = globalThis as typeof globalThis & {
  hymnDistributionMemory?: DistributionState;
  hymnDistributionPool?: mysql.Pool;
};

const initialRelease: Release = {
  ...sampleReleases[0],
  trackName: sampleReleases[0]?.trackName ?? "No Sleep For The Weak",
  artistName: sampleReleases[0]?.artistName ?? "Aarav Flamez",
  releaseTitle: sampleReleases[0]?.trackName ?? "No Sleep For The Weak",
  originalReleaseDate: sampleReleases[0]?.releaseDate ?? "2026-04-15",
  labelName: "HYMN Music",
  labelDisplayName: "HYMN Music",
  primaryGenre: "Hip-Hop",
  secondaryGenre: "Trap",
  language: "Hindi",
  mood: "Aggressive",
  territory: "Worldwide",
  releaseTiming: "midnight_global",
  copyrightOwner: "Aarav Flamez",
  publishingRights: "Aarav Flamez",
  ownershipConfirmed: true,
  noUnauthorizedSamples: true,
  collaboratorsCredited: true,
  platformCompliant: true,
  hymnNotLiable: true,
  agreedToTerms: true,
  falseMetadataAcknowledged: true,
  paymentModel: "one_time",
  paymentStatus: "paid",
  distributionPlan: "pay_per_release",
  queuePosition: 4,
  estimatedReviewTime: "24-48 hours",
  status: "in_queue",
  tracks: [
    {
      id: 1,
      releaseId: sampleReleases[0]?.id ?? 1,
      trackTitle: sampleReleases[0]?.trackName ?? "No Sleep For The Weak",
      version: "Original",
      trackNumber: 1,
      primaryArtist: sampleReleases[0]?.artistName ?? "Aarav Flamez",
      featuredArtists: "",
      additionalPrimaryArtists: "",
      songwriters: "Aarav Flamez",
      composers: "Aarav Flamez",
      producers: "HYMN Demo Producer",
      isrc: "AUTO-HYMN-0001",
      isCover: false,
      originalArtist: "",
      coverLicenseConfirmed: false,
      audioUrl: sampleReleases[0]?.audioUrl ?? "/uploads/releases/no-sleep.wav",
      duration: "03:12",
      bpm: 142,
      musicalKey: "Fm",
      explicitContent: true,
      dolbyAtmos: false,
      createdAt: sampleReleases[0]?.createdAt ?? new Date().toISOString()
    }
  ]
};

const memory = globalState.hymnDistributionMemory ?? {
  releases: [initialRelease],
  subscriptions: [
    {
      id: 1,
      userId: 2,
      plan: "basic",
      expiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString(),
      releasesUsed: 1,
      releaseLimit: 4,
      createdAt: new Date().toISOString()
    }
  ],
  orders: [],
  distributionLogs: [],
  auditLogs: []
};

globalState.hymnDistributionMemory = memory;

function getPool() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const looksLikeExample = !databaseUrl || databaseUrl === "mysql://user:password@localhost:3306/hymn";
  if (looksLikeExample) return null;
  if (!globalState.hymnDistributionPool) {
    globalState.hymnDistributionPool = mysql.createPool({ uri: databaseUrl, connectionLimit: 10 });
  }
  return globalState.hymnDistributionPool;
}

function nextId(items: { id: number }[]) {
  return items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function ensureDistributionAutomationTables(pool: mysql.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS distribution_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      release_id BIGINT NOT NULL,
      request_payload JSON NULL,
      response_payload JSON NULL,
      warnings JSON NULL,
      errors JSON NULL,
      success BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_distribution_logs_release_created (release_id, created_at),
      CONSTRAINT fk_distribution_logs_release FOREIGN KEY (release_id) REFERENCES releases(id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS release_audit_logs (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      release_id BIGINT NOT NULL,
      user_id BIGINT NULL,
      action VARCHAR(120) NOT NULL,
      details JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_release_audit_logs_release_created (release_id, created_at),
      CONSTRAINT fk_release_audit_logs_release FOREIGN KEY (release_id) REFERENCES releases(id),
      CONSTRAINT fk_release_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
}

function planLimits(plan: SubscriptionPlan) {
  if (plan === "basic") return { amount: 700, limit: 4, expiryDays: 180 };
  if (plan === "pro") return { amount: 1600, limit: 18, expiryDays: 365 };
  if (plan === "elite") return { amount: 7999, limit: null, expiryDays: 365 };
  return { amount: 99, limit: 1, expiryDays: 7 };
}

function queueSummaryFromMemory(): DistributionQueueSummary {
  const inQueue = memory.releases.filter((release) => release.status === "submitted" || release.status === "in_queue").length;
  const reviewing = memory.releases.filter((release) => release.status === "under_review").length || 6;
  return {
    currentlyReviewing: reviewing,
    nextBatchIn: "4h 21m",
    averageApprovalTime: "24-48 hours",
    pendingQueue: inQueue
  };
}

export async function getDistributionQueueSummary(): Promise<DistributionQueueSummary> {
  const pool = getPool();
  if (!pool) return queueSummaryFromMemory();
  const [queueRows] = await pool.query("SELECT COUNT(*) AS total FROM release_queue WHERE status IN ('submitted','in_queue')");
  const [reviewRows] = await pool.query("SELECT COUNT(*) AS total FROM releases WHERE status = 'under_review'");
  return {
    currentlyReviewing: Number((reviewRows as Array<{ total: number }>)[0]?.total ?? 6),
    nextBatchIn: "4h 21m",
    averageApprovalTime: "24-48 hours",
    pendingQueue: Number((queueRows as Array<{ total: number }>)[0]?.total ?? 0)
  };
}

export async function listDetailedReleasesByUser(userId: number): Promise<Release[]> {
  const pool = getPool();
  if (!pool) return memory.releases.filter((release) => release.userId === userId).sort((a, b) => b.id - a.id);
  const [rows] = await pool.query(
    `SELECT r.id, r.user_id AS userId, r.artist_name AS artistName, r.track_name AS trackName, r.release_title AS releaseTitle,
            r.release_type AS releaseType, r.audio_url AS audioUrl, r.artwork_url AS artworkUrl, r.release_date AS releaseDate,
            r.original_release_date AS originalReleaseDate, r.record_label_name AS labelName, r.primary_genre AS primaryGenre,
            r.secondary_genre AS secondaryGenre, r.language, r.mood, r.platforms, r.youtube_content_id_enabled AS youtubeContentIdEnabled,
            r.youtube_content_id_channel_url AS youtubeContentIdChannelUrl, r.monetisation_accepted AS monetisationAccepted,
            r.monetisation_clauses AS monetisationClauses, r.territory, r.upc_code AS upcCode,
            r.release_timing AS releaseTiming, r.copyright_owner AS copyrightOwner, r.publishing_rights AS publishingRights,
            r.payment_model AS paymentModel, r.payment_status AS paymentStatus, r.distribution_plan AS distributionPlan,
            r.status, q.position AS queuePosition, q.estimated_review_time AS estimatedReviewTime, r.created_at AS createdAt
     FROM releases r
     LEFT JOIN release_queue q ON q.release_id = r.id
     WHERE r.user_id = ?
     ORDER BY r.created_at DESC`,
    [userId]
  );
  const releases = (rows as Array<Omit<Release, "platforms" | "tracks"> & { platforms: string }>).map((row) => ({
    ...row,
    platforms: JSON.parse(row.platforms),
    tracks: [] as ReleaseTrack[]
  }));
  for (const release of releases) {
    release.tracks = await listTracksByRelease(release.id);
  }
  return releases;
}


export async function getDetailedReleaseByUserId(userId: number, releaseId: number): Promise<Release | null> {
  const pool = getPool();
  if (!pool) return memory.releases.find((release) => release.userId === userId && release.id === releaseId) ?? null;
  const releases = await listDetailedReleasesByUser(userId);
  return releases.find((release) => release.id === releaseId) ?? null;
}
export async function listAllDetailedReleases(): Promise<Release[]> {
  const pool = getPool();
  if (!pool) return [...memory.releases].sort((a, b) => b.id - a.id);
  const [rows] = await pool.query(
    `SELECT r.id, r.user_id AS userId, r.artist_name AS artistName, r.track_name AS trackName, r.release_title AS releaseTitle,
            r.release_type AS releaseType, r.audio_url AS audioUrl, r.artwork_url AS artworkUrl, r.release_date AS releaseDate,
            r.original_release_date AS originalReleaseDate, r.record_label_name AS labelName, r.primary_genre AS primaryGenre,
            r.secondary_genre AS secondaryGenre, r.language, r.mood, r.platforms, r.youtube_content_id_enabled AS youtubeContentIdEnabled,
            r.youtube_content_id_channel_url AS youtubeContentIdChannelUrl, r.monetisation_accepted AS monetisationAccepted,
            r.monetisation_clauses AS monetisationClauses, r.territory, r.upc_code AS upcCode,
            r.release_timing AS releaseTiming, r.copyright_owner AS copyrightOwner, r.publishing_rights AS publishingRights,
            r.payment_model AS paymentModel, r.payment_status AS paymentStatus, r.distribution_plan AS distributionPlan,
            r.status, q.position AS queuePosition, q.estimated_review_time AS estimatedReviewTime, r.created_at AS createdAt
     FROM releases r
     LEFT JOIN release_queue q ON q.release_id = r.id
     ORDER BY r.created_at DESC`
  );
  const releases = (rows as Array<Omit<Release, "platforms" | "tracks"> & { platforms: string }>).map((row) => ({
    ...row,
    platforms: JSON.parse(row.platforms),
    tracks: [] as ReleaseTrack[]
  }));
  for (const release of releases) {
    release.tracks = await listTracksByRelease(release.id);
  }
  return releases;
}

export async function listTracksByRelease(releaseId: number): Promise<ReleaseTrack[]> {
  const pool = getPool();
  if (!pool) {
    return memory.releases.find((release) => release.id === releaseId)?.tracks ?? [];
  }
  const [rows] = await pool.query(
    `SELECT id, release_id AS releaseId, title AS trackTitle, version, track_number AS trackNumber, primary_artist AS primaryArtist,
            featured_artists AS featuredArtists, additional_primary_artist AS additionalPrimaryArtists, songwriters, composers,
            producers, isrc, is_cover AS isCover, original_artist AS originalArtist, cover_license_confirmed AS coverLicenseConfirmed,
            audio_url AS audioUrl, duration, bpm, musical_key AS musicalKey, explicit_content AS explicitContent,
            dolby_atmos AS dolbyAtmos, created_at AS createdAt
     FROM tracks WHERE release_id = ? ORDER BY track_number ASC`,
    [releaseId]
  );
  return rows as ReleaseTrack[];
}

export async function updateDetailedReleaseStatus(releaseId: number, status: ReleaseStatus, note?: string) {
  const pool = getPool();
  if (!pool) {
    const release = memory.releases.find((item) => item.id === releaseId);
    if (!release) return null;
    release.status = status;
    if (status === "in_queue" && release.queuePosition == null) {
      release.queuePosition = memory.releases.filter((item) => item.status === "submitted" || item.status === "in_queue").length;
    }
    return release;
  }
  await pool.query("UPDATE releases SET status = ? WHERE id = ?", [status, releaseId]);
  if (status === "in_queue") {
    await pool.query("UPDATE release_queue SET status = 'in_queue' WHERE release_id = ?", [releaseId]);
  }
  const releases = await listAllDetailedReleases();
  return releases.find((item) => item.id === releaseId) ?? null;
}

export async function getDetailedReleaseById(releaseId: number): Promise<Release | null> {
  const pool = getPool();
  if (!pool) return memory.releases.find((release) => release.id === releaseId) ?? null;
  const releases = await listAllDetailedReleases();
  return releases.find((release) => release.id === releaseId) ?? null;
}

export async function logDistributionEvent(input: {
  releaseId: number;
  requestPayload?: unknown;
  responsePayload?: unknown;
  warnings?: string[] | null;
  errors?: string[] | null;
  success: boolean;
}) {
  const pool = getPool();
  if (!pool) {
    const log: DistributionLog = {
      id: nextId(memory.distributionLogs),
      releaseId: input.releaseId,
      requestPayload: input.requestPayload,
      responsePayload: input.responsePayload,
      warnings: input.warnings ?? null,
      errors: input.errors ?? null,
      success: input.success,
      createdAt: new Date().toISOString()
    };
    memory.distributionLogs.unshift(log);
    return log;
  }
  await ensureDistributionAutomationTables(pool);
  const [result] = await pool.query(
    `INSERT INTO distribution_logs (release_id, request_payload, response_payload, warnings, errors, success)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.releaseId,
      JSON.stringify(input.requestPayload ?? null),
      JSON.stringify(input.responsePayload ?? null),
      JSON.stringify(input.warnings ?? null),
      JSON.stringify(input.errors ?? null),
      input.success
    ]
  );
  return {
    id: Number((result as mysql.ResultSetHeader).insertId),
    releaseId: input.releaseId,
    requestPayload: input.requestPayload,
    responsePayload: input.responsePayload,
    warnings: input.warnings ?? null,
    errors: input.errors ?? null,
    success: input.success,
    createdAt: new Date().toISOString()
  } satisfies DistributionLog;
}

export async function listDistributionLogsByRelease(releaseId: number): Promise<DistributionLog[]> {
  const pool = getPool();
  if (!pool) return memory.distributionLogs.filter((log) => log.releaseId === releaseId);
  await ensureDistributionAutomationTables(pool);
  const [rows] = await pool.query(
    `SELECT id, release_id AS releaseId, request_payload AS requestPayload, response_payload AS responsePayload,
            warnings, errors, success, created_at AS createdAt
     FROM distribution_logs WHERE release_id = ? ORDER BY created_at DESC`,
    [releaseId]
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    releaseId: Number(row.releaseId),
    requestPayload: safeJsonParse(row.requestPayload, null),
    responsePayload: safeJsonParse(row.responsePayload, null),
    warnings: safeJsonParse<string[] | null>(row.warnings, null),
    errors: safeJsonParse<string[] | null>(row.errors, null),
    success: Boolean(row.success),
    createdAt: String(row.createdAt)
  }));
}

export async function createReleaseAuditLog(input: { releaseId: number; userId?: number | null; action: string; details?: unknown }) {
  const pool = getPool();
  if (!pool) {
    const log: ReleaseAuditLog = {
      id: nextId(memory.auditLogs),
      releaseId: input.releaseId,
      userId: input.userId ?? null,
      action: input.action,
      details: input.details,
      createdAt: new Date().toISOString()
    };
    memory.auditLogs.unshift(log);
    return log;
  }
  await ensureDistributionAutomationTables(pool);
  const [result] = await pool.query(
    "INSERT INTO release_audit_logs (release_id, user_id, action, details) VALUES (?, ?, ?, ?)",
    [input.releaseId, input.userId ?? null, input.action, JSON.stringify(input.details ?? null)]
  );
  return {
    id: Number((result as mysql.ResultSetHeader).insertId),
    releaseId: input.releaseId,
    userId: input.userId ?? null,
    action: input.action,
    details: input.details,
    createdAt: new Date().toISOString()
  } satisfies ReleaseAuditLog;
}

export async function listReleaseAuditLogs(releaseId: number): Promise<ReleaseAuditLog[]> {
  const pool = getPool();
  if (!pool) return memory.auditLogs.filter((log) => log.releaseId === releaseId);
  await ensureDistributionAutomationTables(pool);
  const [rows] = await pool.query(
    `SELECT id, release_id AS releaseId, user_id AS userId, action, details, created_at AS createdAt
     FROM release_audit_logs WHERE release_id = ? ORDER BY created_at DESC`,
    [releaseId]
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    releaseId: Number(row.releaseId),
    userId: row.userId == null ? null : Number(row.userId),
    action: String(row.action),
    details: safeJsonParse(row.details, null),
    createdAt: String(row.createdAt)
  }));
}

export async function markReleaseDistributionSuccess(input: {
  releaseId: number;
  status: ReleaseStatus;
  distributorReleaseId?: string | null;
  upc?: string | null;
  trackIsrcs?: Array<{ trackNumber?: number; trackTitle?: string; isrc?: string | null; distributorStatus?: string | null }>;
}) {
  const pool = getPool();
  if (!pool) {
    const release = memory.releases.find((item) => item.id === input.releaseId);
    if (!release) return null;
    release.status = input.status;
    release.distributorReleaseId = input.distributorReleaseId ?? release.distributorReleaseId ?? null;
    release.upcCode = input.upc ?? release.upcCode ?? null;
    release.distributedAt = new Date().toISOString();
    for (const isrc of input.trackIsrcs ?? []) {
      const track = release.tracks?.find((item) => item.trackNumber === isrc.trackNumber || item.trackTitle === isrc.trackTitle);
      if (track) {
        track.isrc = isrc.isrc ?? track.isrc;
        track.distributorStatus = isrc.distributorStatus ?? track.distributorStatus ?? input.status;
      }
    }
    return release;
  }
  await pool.query("UPDATE releases SET status = ?, upc_code = COALESCE(?, upc_code) WHERE id = ?", [input.status, input.upc ?? null, input.releaseId]);
  for (const isrc of input.trackIsrcs ?? []) {
    if (!isrc.isrc) continue;
    if (isrc.trackNumber) {
      await pool.query("UPDATE tracks SET isrc = ? WHERE release_id = ? AND track_number = ?", [isrc.isrc, input.releaseId, isrc.trackNumber]);
    } else if (isrc.trackTitle) {
      await pool.query("UPDATE tracks SET isrc = ? WHERE release_id = ? AND title = ?", [isrc.isrc, input.releaseId, isrc.trackTitle]);
    }
  }
  return getDetailedReleaseById(input.releaseId);
}

export async function createDistributionOrder(input: { userId: number; plan: SubscriptionPlan; amount: number; razorpayOrderId: string; }) {
  const pool = getPool();
  if (!pool) {
    const order: DistributionOrder = {
      id: nextId(memory.orders),
      userId: input.userId,
      releaseId: null,
      plan: input.plan,
      amount: input.amount,
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: null,
      paymentStatus: "created",
      createdAt: new Date().toISOString()
    };
    memory.orders.unshift(order);
    return order;
  }
  const [result] = await pool.query(
    "INSERT INTO distribution_orders (user_id, plan, amount, razorpay_order_id, payment_status) VALUES (?, ?, ?, ?, 'created')",
    [input.userId, input.plan, input.amount, input.razorpayOrderId]
  );
  return {
    id: Number((result as mysql.ResultSetHeader).insertId),
    userId: input.userId,
    releaseId: null,
    plan: input.plan,
    amount: input.amount,
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: null,
    paymentStatus: "created",
    createdAt: new Date().toISOString()
  };
}

export async function listAllDistributionOrders(): Promise<DistributionOrder[]> {
  const pool = getPool();
  if (!pool) {
    return [...memory.orders].sort((a, b) => b.id - a.id);
  }
  const [rows] = await pool.query(
    "SELECT id, user_id AS userId, release_id AS releaseId, plan, amount, razorpay_order_id AS razorpayOrderId, razorpay_payment_id AS razorpayPaymentId, payment_status AS paymentStatus, created_at AS createdAt FROM distribution_orders ORDER BY created_at DESC"
  );
  return rows as DistributionOrder[];
}

export async function markDistributionOrderPaid(orderId: string, paymentId: string) {
  const pool = getPool();
  if (!pool) {
    const order = memory.orders.find((item) => item.razorpayOrderId === orderId);
    if (!order) return null;
    order.razorpayPaymentId = paymentId;
    order.paymentStatus = "paid";
    return order;
  }
  await pool.query("UPDATE distribution_orders SET razorpay_payment_id = ?, payment_status = 'paid' WHERE razorpay_order_id = ?", [paymentId, orderId]);
  const [rows] = await pool.query(
    "SELECT id, user_id AS userId, release_id AS releaseId, plan, amount, razorpay_order_id AS razorpayOrderId, razorpay_payment_id AS razorpayPaymentId, payment_status AS paymentStatus, created_at AS createdAt FROM distribution_orders WHERE razorpay_order_id = ? LIMIT 1",
    [orderId]
  );
  return (rows as DistributionOrder[])[0] ?? null;
}

export async function createOrRefreshSubscription(userId: number, plan: SubscriptionPlan) {
  if (plan === "pay_per_release") return null;
  const pool = getPool();
  const { limit, expiryDays } = planLimits(plan);
  const expiry = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  if (!pool) {
    const existing = memory.subscriptions.find((item) => item.userId === userId);
    if (existing) {
      existing.plan = plan;
      existing.expiry = expiry;
      existing.releaseLimit = limit;
      return existing;
    }
    const subscription: Subscription = {
      id: nextId(memory.subscriptions),
      userId,
      plan,
      expiry,
      releasesUsed: 0,
      releaseLimit: limit,
      createdAt: new Date().toISOString()
    };
    memory.subscriptions.unshift(subscription);
    return subscription;
  }
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, expiry, releases_used, release_limit)
     VALUES (?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE plan = VALUES(plan), expiry = VALUES(expiry), release_limit = VALUES(release_limit)`,
    [userId, plan, expiry, limit]
  );
  const [rows] = await pool.query(
    "SELECT id, user_id AS userId, plan, expiry, releases_used AS releasesUsed, release_limit AS releaseLimit, created_at AS createdAt FROM subscriptions WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return (rows as Subscription[])[0] ?? null;
}

type DraftTrackInput = Omit<ReleaseTrack, "id" | "releaseId" | "createdAt"> & { audioUrl?: string };

export async function saveDraftDistributionRelease(input: {
  userId: number;
  draftReleaseId?: number | null;
  metadata: Omit<Release, "id" | "userId" | "status" | "createdAt" | "queuePosition" | "estimatedReviewTime" | "tracks"> & {
    recordLabelName?: string;
    tracks: DraftTrackInput[];
  };
}) {
  const pool = getPool();
  const existingRelease = input.draftReleaseId ? await getDetailedReleaseByUserId(input.userId, input.draftReleaseId) : null;
  const releaseId = input.draftReleaseId ?? existingRelease?.id ?? nextId(memory.releases);
  const now = new Date().toISOString();
  const baseTrack = input.metadata.tracks[0] ?? {
    trackTitle: input.metadata.trackName || input.metadata.releaseTitle || "Untitled track",
    version: undefined,
    trackNumber: 1,
    primaryArtist: input.metadata.artistName,
    featuredArtists: undefined,
    additionalPrimaryArtists: undefined,
    songwriters: input.metadata.artistName,
    composers: input.metadata.artistName,
    producers: input.metadata.artistName,
    isrc: undefined,
    isCover: false,
    originalArtist: undefined,
    originalTrackLink: undefined,
    coverLicenseConfirmed: false,
    audioUrl: input.metadata.audioUrl || "",
    duration: "",
    bpm: null,
    musicalKey: undefined,
    explicitContent: false,
    dolbyAtmos: false
  };
  const trackRows = input.metadata.tracks.length > 0 ? input.metadata.tracks : [baseTrack];
  const normalizedTracks: ReleaseTrack[] = trackRows.map((track, index) => ({
    ...track,
    id: index + 1,
    releaseId,
    createdAt: now,
    audioUrl: track.audioUrl ?? ""
  }));

  if (!pool) {
    const draft: Release = {
      ...input.metadata,
      id: releaseId,
      userId: input.userId,
      status: "draft",
      queuePosition: null,
      estimatedReviewTime: null,
      paymentStatus: "pending",
      trackName: input.metadata.trackName || input.metadata.releaseTitle || "Untitled release",
      audioUrl: input.metadata.audioUrl || "",
      artworkUrl: input.metadata.artworkUrl || "",
      createdAt: existingRelease?.createdAt ?? now,
      tracks: normalizedTracks
    };
    const existingIndex = memory.releases.findIndex((item) => item.id === releaseId);
    if (existingIndex >= 0) {
      memory.releases[existingIndex] = draft;
    } else {
      memory.releases.unshift(draft);
    }
    return draft;
  }

  const releaseValues = [
    input.userId,
    input.metadata.artistName,
    input.metadata.trackName || input.metadata.releaseTitle,
    input.metadata.releaseTitle,
    input.metadata.releaseType,
    input.metadata.audioUrl || existingRelease?.audioUrl || "",
    input.metadata.artworkUrl || existingRelease?.artworkUrl || "",
    input.metadata.releaseDate || existingRelease?.releaseDate || "",
    input.metadata.originalReleaseDate ?? existingRelease?.originalReleaseDate ?? null,
    input.metadata.labelName ?? input.metadata.recordLabelName ?? existingRelease?.labelName ?? null,
    input.metadata.primaryGenre ?? existingRelease?.primaryGenre ?? null,
    input.metadata.secondaryGenre ?? existingRelease?.secondaryGenre ?? null,
    input.metadata.language ?? existingRelease?.language ?? "",
    input.metadata.mood ?? existingRelease?.mood ?? null,
    JSON.stringify(input.metadata.platforms ?? existingRelease?.platforms ?? []),
    input.metadata.youtubeContentIdEnabled ?? existingRelease?.youtubeContentIdEnabled ?? false,
    input.metadata.youtubeContentIdChannelUrl ?? existingRelease?.youtubeContentIdChannelUrl ?? null,
    input.metadata.monetisationAccepted ?? existingRelease?.monetisationAccepted ?? false,
    JSON.stringify(input.metadata.monetisationClauses ?? existingRelease?.monetisationClauses ?? {}),
    input.metadata.territory ?? existingRelease?.territory ?? null,
    input.metadata.upcCode ?? existingRelease?.upcCode ?? null,
    input.metadata.releaseTiming ?? existingRelease?.releaseTiming ?? null,
    input.metadata.copyrightOwner ?? existingRelease?.copyrightOwner ?? null,
    input.metadata.publishingRights ?? existingRelease?.publishingRights ?? null,
    input.metadata.paymentModel ?? existingRelease?.paymentModel ?? "one_time",
    input.metadata.distributionPlan ?? existingRelease?.distributionPlan ?? "pay_per_release",
    input.metadata.ownershipConfirmed ?? existingRelease?.ownershipConfirmed ?? false,
    input.metadata.noUnauthorizedSamples ?? existingRelease?.noUnauthorizedSamples ?? false,
    input.metadata.collaboratorsCredited ?? existingRelease?.collaboratorsCredited ?? false,
    input.metadata.platformCompliant ?? existingRelease?.platformCompliant ?? false,
    input.metadata.hymnNotLiable ?? existingRelease?.hymnNotLiable ?? false,
    input.metadata.agreedToTerms ?? existingRelease?.agreedToTerms ?? false,
    input.metadata.falseMetadataAcknowledged ?? existingRelease?.falseMetadataAcknowledged ?? false
  ];

  if (existingRelease) {
    await pool.query(
      `UPDATE releases SET
        artist_name = ?, track_name = ?, release_title = ?, release_type = ?, audio_url = ?, artwork_url = ?, release_date = ?, original_release_date = ?,
        record_label_name = ?, primary_genre = ?, secondary_genre = ?, language = ?, mood = ?, platforms = ?, youtube_content_id_enabled = ?, youtube_content_id_channel_url = ?,
        monetisation_accepted = ?, monetisation_clauses = ?, territory = ?, upc_code = ?, release_timing = ?, copyright_owner = ?, publishing_rights = ?, payment_model = ?, payment_status = 'pending', distribution_plan = ?, status = 'draft',
        ownership_confirmed = ?, no_unauthorized_samples = ?, collaborators_credited = ?, platform_compliant = ?, hymn_not_liable = ?,
        agreed_to_terms = ?, false_metadata_acknowledged = ?
       WHERE id = ? AND user_id = ?`,
      [...releaseValues, input.draftReleaseId ?? releaseId, input.userId]
    );
  } else {
    await pool.query(
      `INSERT INTO releases (
        user_id, artist_name, track_name, release_title, release_type, audio_url, artwork_url, release_date, original_release_date,
        record_label_name, primary_genre, secondary_genre, language, mood, platforms, youtube_content_id_enabled, youtube_content_id_channel_url,
        monetisation_accepted, monetisation_clauses, territory, upc_code, release_timing, copyright_owner, publishing_rights, payment_model, payment_status, distribution_plan, status,
        ownership_confirmed, no_unauthorized_samples, collaborators_credited, platform_compliant, hymn_not_liable,
        agreed_to_terms, false_metadata_acknowledged, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'draft', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      releaseValues
    );
  }

  const targetReleaseId = input.draftReleaseId ?? releaseId;
  await pool.query("DELETE FROM tracks WHERE release_id = ?", [targetReleaseId]);
  for (const track of normalizedTracks) {
    await pool.query(
      `INSERT INTO tracks (
        release_id, title, version, track_number, primary_artist, featured_artists, additional_primary_artist,
        songwriters, composers, producers, isrc, is_cover, original_artist, cover_license_confirmed,
        audio_url, duration, bpm, musical_key, explicit_content, dolby_atmos
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetReleaseId,
        track.trackTitle,
        track.version ?? null,
        track.trackNumber,
        track.primaryArtist,
        track.featuredArtists ?? null,
        track.additionalPrimaryArtists ?? null,
        track.songwriters,
        track.composers,
        track.producers,
        track.isrc ?? null,
        track.isCover,
        track.originalArtist ?? null,
        track.coverLicenseConfirmed ?? false,
        track.audioUrl ?? "",
        track.duration ?? "",
        track.bpm ?? null,
        track.musicalKey ?? null,
        track.explicitContent,
        track.dolbyAtmos
      ]
    );
  }

  const releases = await listDetailedReleasesByUser(input.userId);
  return releases.find((release) => release.id === targetReleaseId) ?? null;
}

export async function submitPaidDistributionRelease(input: {
  userId: number;
  metadata: Omit<Release, "id" | "userId" | "status" | "createdAt" | "queuePosition" | "estimatedReviewTime" | "tracks"> & { recordLabelName?: string; tracks: Omit<ReleaseTrack, "id" | "releaseId" | "createdAt">[] };
  razorpayOrderId: string;
  razorpayPaymentId: string;
}) {
  const queuePosition = (await getDistributionQueueSummary()).pendingQueue + 1;
  const pool = getPool();

  if (!pool) {
    const releaseId = nextId(memory.releases);
    const release: Release = {
      ...input.metadata,
      id: releaseId,
      userId: input.userId,
      trackName: input.metadata.tracks[0]?.trackTitle ?? input.metadata.releaseTitle,
      audioUrl: input.metadata.tracks[0]?.audioUrl ?? "",
      status: "submitted",
      queuePosition,
      estimatedReviewTime: "24-48 hours",
      paymentStatus: "paid",
      createdAt: new Date().toISOString(),
      tracks: input.metadata.tracks.map((track, index) => ({
        ...track,
        id: index + 1,
        releaseId,
        createdAt: new Date().toISOString()
      }))
    };
    memory.releases.unshift(release);
    const order = memory.orders.find((item) => item.razorpayOrderId === input.razorpayOrderId);
    if (order) {
      order.releaseId = releaseId;
      order.razorpayPaymentId = input.razorpayPaymentId;
      order.paymentStatus = "paid";
    }
    await createOrRefreshSubscription(input.userId, input.metadata.distributionPlan ?? "pay_per_release");
    return release;
  }

  const [result] = await pool.query(
    `INSERT INTO releases (
      user_id, artist_name, track_name, release_title, release_type, audio_url, artwork_url, release_date, original_release_date,
      record_label_name, primary_genre, secondary_genre, language, mood, platforms, youtube_content_id_enabled, youtube_content_id_channel_url,
      monetisation_accepted, monetisation_clauses, territory, upc_code, release_timing, copyright_owner, publishing_rights, payment_model, payment_status, distribution_plan, status,
      ownership_confirmed, no_unauthorized_samples, collaborators_credited, platform_compliant, hymn_not_liable,
      agreed_to_terms, false_metadata_acknowledged, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      input.userId,
      input.metadata.artistName,
      input.metadata.tracks[0]?.trackTitle ?? input.metadata.releaseTitle,
      input.metadata.releaseTitle,
      input.metadata.releaseType,
      input.metadata.tracks[0]?.audioUrl ?? "",
      input.metadata.artworkUrl,
      input.metadata.releaseDate,
      input.metadata.originalReleaseDate ?? null,
      input.metadata.labelName ?? null,
      input.metadata.primaryGenre ?? null,
      input.metadata.secondaryGenre ?? null,
      input.metadata.language,
      input.metadata.mood ?? null,
      JSON.stringify(input.metadata.platforms),
      input.metadata.territory ?? null,
      input.metadata.upcCode ?? null,
      input.metadata.releaseTiming ?? null,
      input.metadata.copyrightOwner ?? null,
      input.metadata.publishingRights ?? null,
      input.metadata.paymentModel ?? "one_time",
      input.metadata.distributionPlan ?? "pay_per_release",
      input.metadata.ownershipConfirmed ?? false,
      input.metadata.noUnauthorizedSamples ?? false,
      input.metadata.collaboratorsCredited ?? false,
      input.metadata.platformCompliant ?? false,
      input.metadata.hymnNotLiable ?? false,
      input.metadata.agreedToTerms ?? false,
      input.metadata.falseMetadataAcknowledged ?? false
    ]
  );
  const releaseId = Number((result as mysql.ResultSetHeader).insertId);

  for (const track of input.metadata.tracks) {
    await pool.query(
      `INSERT INTO tracks (
        release_id, title, version, track_number, primary_artist, featured_artists, additional_primary_artist,
        songwriters, composers, producers, isrc, is_cover, original_artist, cover_license_confirmed,
        audio_url, duration, bpm, musical_key, explicit_content, dolby_atmos
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        releaseId,
        track.trackTitle,
        track.version ?? null,
        track.trackNumber,
        track.primaryArtist,
        track.featuredArtists ?? null,
        track.additionalPrimaryArtists ?? null,
        track.songwriters,
        track.composers,
        track.producers,
        track.isrc ?? null,
        track.isCover,
        track.originalArtist ?? null,
        track.coverLicenseConfirmed,
        track.audioUrl,
        track.duration,
        track.bpm ?? null,
        track.musicalKey ?? null,
        track.explicitContent,
        track.dolbyAtmos
      ]
    );
  }

  await pool.query(
    "INSERT INTO release_queue (release_id, position, estimated_review_time, status) VALUES (?, ?, '24-48 hours', 'submitted')",
    [releaseId, queuePosition]
  );
  await pool.query(
    "UPDATE distribution_orders SET release_id = ?, razorpay_payment_id = ?, payment_status = 'paid' WHERE razorpay_order_id = ?",
    [releaseId, input.razorpayPaymentId, input.razorpayOrderId]
  );
  await createOrRefreshSubscription(input.userId, input.metadata.distributionPlan ?? "pay_per_release");

  const releases = await listDetailedReleasesByUser(input.userId);
  return releases.find((release) => release.id === releaseId) ?? null;
}

export async function updatePaidDistributionRelease(input: {
  userId: number;
  releaseId: number;
  metadata: Omit<Release, "id" | "userId" | "status" | "createdAt" | "queuePosition" | "estimatedReviewTime" | "tracks"> & { recordLabelName?: string; tracks: Omit<ReleaseTrack, "id" | "releaseId" | "createdAt">[] };
}) {
  const pool = getPool();
  const queuePosition = (await getDistributionQueueSummary()).pendingQueue + 1;
  const existingRelease = await getDetailedReleaseByUserId(input.userId, input.releaseId);
  if (!existingRelease) return null;

  if (!pool) {
    const release = memory.releases.find((item) => item.id === input.releaseId && item.userId === input.userId);
    if (!release) return null;
    release.artistName = input.metadata.artistName;
    release.trackName = input.metadata.tracks[0]?.trackTitle ?? input.metadata.releaseTitle;
    release.releaseTitle = input.metadata.releaseTitle;
    release.releaseType = input.metadata.releaseType;
    release.audioUrl = input.metadata.tracks[0]?.audioUrl ?? release.audioUrl;
    release.artworkUrl = input.metadata.artworkUrl;
    release.releaseDate = input.metadata.releaseDate;
    release.originalReleaseDate = input.metadata.originalReleaseDate;
    release.labelName = input.metadata.labelName ?? release.labelName;
    release.labelDisplayName = input.metadata.labelName ?? input.metadata.recordLabelName;
    release.primaryGenre = input.metadata.primaryGenre;
    release.secondaryGenre = input.metadata.secondaryGenre;
    release.genre = input.metadata.primaryGenre;
    release.mood = input.metadata.mood;
    release.language = input.metadata.language;
    release.platforms = input.metadata.platforms;
    release.youtubeContentIdEnabled = input.metadata.youtubeContentIdEnabled;
    release.youtubeContentIdChannelUrl = input.metadata.youtubeContentIdChannelUrl;
    release.monetisationAccepted = input.metadata.monetisationAccepted;
    release.monetisationClauses = input.metadata.monetisationClauses;
    release.territory = input.metadata.territory;
    release.upcCode = input.metadata.upcCode;
    release.releaseTiming = input.metadata.releaseTiming;
    release.copyrightOwner = input.metadata.copyrightOwner;
    release.publishingRights = input.metadata.publishingRights;
    release.paymentModel = input.metadata.paymentModel;
    release.paymentStatus = "paid";
    release.distributionPlan = input.metadata.distributionPlan;
    release.ownershipConfirmed = input.metadata.ownershipConfirmed;
    release.noUnauthorizedSamples = input.metadata.noUnauthorizedSamples;
    release.collaboratorsCredited = input.metadata.collaboratorsCredited;
    release.platformCompliant = input.metadata.platformCompliant;
    release.hymnNotLiable = input.metadata.hymnNotLiable;
    release.agreedToTerms = input.metadata.agreedToTerms;
    release.falseMetadataAcknowledged = input.metadata.falseMetadataAcknowledged;
    release.status = "under_review";
    release.queuePosition = existingRelease.queuePosition ?? queuePosition;
    release.estimatedReviewTime = "24-48 hours";
    release.tracks = input.metadata.tracks.map((track, index) => ({
      ...track,
      id: index + 1,
      releaseId: input.releaseId,
      createdAt: new Date().toISOString()
    }));
    return release;
  }

  await pool.query(
    `UPDATE releases SET
      artist_name = ?, track_name = ?, release_title = ?, release_type = ?, audio_url = ?, artwork_url = ?, release_date = ?, original_release_date = ?,
      record_label_name = ?, primary_genre = ?, secondary_genre = ?, language = ?, mood = ?, platforms = ?, youtube_content_id_enabled = ?, youtube_content_id_channel_url = ?,
      monetisation_accepted = ?, monetisation_clauses = ?, territory = ?, upc_code = ?, release_timing = ?, copyright_owner = ?, publishing_rights = ?, payment_model = ?, payment_status = 'paid', distribution_plan = ?, status = 'under_review',
      ownership_confirmed = ?, no_unauthorized_samples = ?, collaborators_credited = ?, platform_compliant = ?, hymn_not_liable = ?,
      agreed_to_terms = ?, false_metadata_acknowledged = ?
     WHERE id = ? AND user_id = ?`,
    [
      input.metadata.artistName,
      input.metadata.tracks[0]?.trackTitle ?? input.metadata.releaseTitle,
      input.metadata.releaseTitle,
      input.metadata.releaseType,
      input.metadata.tracks[0]?.audioUrl ?? existingRelease.audioUrl,
      input.metadata.artworkUrl,
      input.metadata.releaseDate,
      input.metadata.originalReleaseDate ?? null,
      input.metadata.labelName ?? input.metadata.recordLabelName,
      input.metadata.primaryGenre,
      input.metadata.secondaryGenre,
      input.metadata.language,
      input.metadata.mood ?? null,
      JSON.stringify(input.metadata.platforms),
      input.metadata.youtubeContentIdEnabled ?? false,
      input.metadata.youtubeContentIdChannelUrl ?? null,
      input.metadata.monetisationAccepted ?? false,
      JSON.stringify(input.metadata.monetisationClauses ?? null),
      input.metadata.territory ?? null,
      input.metadata.upcCode ?? null,
      input.metadata.releaseTiming ?? null,
      input.metadata.copyrightOwner ?? null,
      input.metadata.publishingRights ?? null,
      input.metadata.paymentModel ?? "one_time",
      input.metadata.distributionPlan ?? "pay_per_release",
      input.metadata.ownershipConfirmed ?? false,
      input.metadata.noUnauthorizedSamples ?? false,
      input.metadata.collaboratorsCredited ?? false,
      input.metadata.platformCompliant ?? false,
      input.metadata.hymnNotLiable ?? false,
      input.metadata.agreedToTerms ?? false,
      input.metadata.falseMetadataAcknowledged ?? false,
      input.releaseId,
      input.userId
    ]
  );

  await pool.query("DELETE FROM tracks WHERE release_id = ?", [input.releaseId]);
  for (const track of input.metadata.tracks) {
    await pool.query(
      `INSERT INTO tracks (
        release_id, title, version, track_number, primary_artist, featured_artists, additional_primary_artist,
        songwriters, composers, producers, isrc, is_cover, original_artist, cover_license_confirmed,
        audio_url, duration, bpm, musical_key, explicit_content, dolby_atmos
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.releaseId,
        track.trackTitle,
        track.version ?? null,
        track.trackNumber,
        track.primaryArtist,
        track.featuredArtists ?? null,
        track.additionalPrimaryArtists ?? null,
        track.songwriters,
        track.composers,
        track.producers,
        track.isrc ?? null,
        track.isCover,
        track.originalArtist ?? null,
        track.coverLicenseConfirmed ?? false,
        track.audioUrl,
        track.duration,
        track.bpm ?? null,
        track.musicalKey ?? null,
        track.explicitContent,
        track.dolbyAtmos
      ]
    );
  }

  const [queueRows] = await pool.query("SELECT id FROM release_queue WHERE release_id = ? LIMIT 1", [input.releaseId]);
  if ((queueRows as Array<{ id: number }>).length > 0) {
    await pool.query("UPDATE release_queue SET position = COALESCE(position, ?), estimated_review_time = '24-48 hours', status = 'under_review' WHERE release_id = ?", [queuePosition, input.releaseId]);
  } else {
    await pool.query("INSERT INTO release_queue (release_id, position, estimated_review_time, status) VALUES (?, ?, '24-48 hours', 'under_review')", [input.releaseId, queuePosition]);
  }

  const releases = await listDetailedReleasesByUser(input.userId);
  return releases.find((release) => release.id === input.releaseId) ?? null;
}
export function getDistributionPricing(plan: SubscriptionPlan, trackCount: number, releaseType: Release["releaseType"], platforms: string[] = [], options?: { youtubeContentIdEnabled?: boolean }) {
  void releaseType;
  const ugcAddonPrice = getUgcAddonPrice(platforms, plan, options);
  if (plan !== "pay_per_release") {
    return planLimits(plan).amount + ugcAddonPrice;
  }
  return getTrackPricingQuote(trackCount).finalPrice + ugcAddonPrice;
}
