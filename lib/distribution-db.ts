import mysql from "mysql2/promise";
import { AdminStoreStatus, DistributionLog, DistributionQueueEntry, DistributionQueueLog, DistributionQueueStage, ReleaseAuditLog, DistributionOrder, DistributionQueueSummary, Release, ReleaseStatus, ReleaseTrack, StoreStatus, StoreStatusHistoryEntry, Subscription, SubscriptionPlan, UserStoreStatus } from "@/lib/types";
import { getTrackPricingQuote, getUgcAddonPrice } from "@/lib/distribution-pricing";
import { sampleReleases } from "@/lib/site";
import { prisma } from "@/lib/prisma";
import { createNotification, findUserById } from "@/lib/db";
import { emailAppUrl, sendReleaseEmail } from "@/lib/email/email-events";
import { transitionReleaseStatus } from "@/lib/release-status-engine";
import { canonicalReleaseArtworkUrl } from "@/lib/release-media";

export function isPostgresPrisma() {
  return /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL?.trim() || "");
}

function camelCaseDatabaseRow(row: Record<string, any>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
}

async function legacyCompatibleReleaseRows(where: "user" | "all", userId?: number) {
  const rows = where === "user"
    ? await prisma.$queryRaw<Array<Record<string, any>>>`
        SELECT * FROM "releases"
        WHERE "archived_at" IS NULL AND ("owner_user_id" = ${userId} OR ("owner_user_id" IS NULL AND "user_id" = ${userId} AND "release_source" <> 'ADMIN_MANUAL'))
        ORDER BY "created_at" DESC
      `
    : await prisma.$queryRaw<Array<Record<string, any>>>`
        SELECT r.*, u.email AS owner_email FROM "releases" r
        LEFT JOIN "users" u ON u.id = r.user_id
        ORDER BY r.created_at DESC
      `;
  const ids = rows.map((row) => Number(row.id)).filter(Number.isInteger);
  const tracks = ids.length ? await prisma.track.findMany({ where: { releaseId: { in: ids } }, orderBy: { trackNumber: "asc" } }) : [];
  const tracksByRelease = new Map<number, typeof tracks>();
  for (const track of tracks) tracksByRelease.set(track.releaseId, [...(tracksByRelease.get(track.releaseId) ?? []), track]);
  return rows.map((row) => ({ ...camelCaseDatabaseRow(row), tracks: tracksByRelease.get(Number(row.id)) ?? [] }));
}

async function legacyCompatibleReleaseForUser(userId: number, releaseId: number) {
  const rows = await prisma.$queryRaw<Array<Record<string, any>>>`
    SELECT * FROM "releases"
    WHERE "id" = ${releaseId}
      AND "archived_at" IS NULL
      AND ("owner_user_id" = ${userId} OR ("owner_user_id" IS NULL AND "user_id" = ${userId} AND "release_source" <> 'ADMIN_MANUAL'))
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const tracks = await prisma.track.findMany({ where: { releaseId }, orderBy: { trackNumber: "asc" } });
  return { ...camelCaseDatabaseRow(row), tracks };
}

async function legacyCompatibleReleaseById(releaseId: number) {
  const rows = await prisma.$queryRaw<Array<Record<string, any>>>`
    SELECT r.*, u."email" AS "owner_email"
    FROM "releases" r
    LEFT JOIN "users" u ON u."id" = r."user_id"
    WHERE r."id" = ${releaseId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const tracks = await prisma.track.findMany({ where: { releaseId }, orderBy: { trackNumber: "asc" } });
  return { ...camelCaseDatabaseRow(row), tracks };
}

export function deserializeRelease(dbData: any): Release {
  const metadata = typeof dbData.metadata === "string" ? JSON.parse(dbData.metadata) : dbData.metadata || {};
  const distributionStores = sanitizeStoreStatuses(metadata.distributionStores);
  return {
    ...metadata,
    id: dbData.id,
    userId: dbData.userId,
    ownerEmail: dbData.ownerEmail ?? dbData.user?.email ?? metadata.ownerEmail ?? null,
    trackName: dbData.title,
    releaseTitle: metadata.releaseTitle || dbData.title,
    artistName: dbData.artistName,
    primaryGenre: dbData.genre,
    releaseType: dbData.releaseType || metadata.releaseType || "single",
    artworkUrl: canonicalReleaseArtworkUrl(Number(dbData.id), dbData.artworkUrl || metadata.artworkUrl),
    audioUrl: dbData.audioUrl || metadata.audioUrl || "",
    paymentStatus: dbData.paymentStatus || "pending",
    status: String(dbData.status || "draft").toLowerCase() as ReleaseStatus,
    distributorReleaseId: dbData.distributorReleaseId,
    direNoteStatus: dbData.direNoteStatus ?? null,
    direNoteLastSyncedAt: dbData.direNoteLastSyncedAt?.toISOString?.() ?? null,
    direNoteLastAttemptedAt: dbData.direNoteLastAttemptedAt?.toISOString?.() ?? null,
    direNoteSyncError: dbData.direNoteSyncError ?? null,
    upcCode: dbData.upc,
    rejectionReason: dbData.rejectionReason ?? metadata.rejectionReason ?? null,
    correctionReason: dbData.correctionReason ?? metadata.correctionReason ?? null,
    reviewIssues: dbData.reviewIssues ?? metadata.reviewIssues ?? null,
    adminInternalNote: dbData.adminInternalNote ?? metadata.adminInternalNote ?? null,
    reviewedAt: dbData.reviewedAt ? dbData.reviewedAt.toISOString() : metadata.reviewedAt ?? null,
    reviewedBy: dbData.reviewedBy ?? metadata.reviewedBy ?? null,
    draftCompletionPercent: dbData.draftCompletionPercent ?? metadata.draftCompletionPercent ?? 0,
    lastEditedAt: dbData.lastEditedAt?.toISOString?.() ?? metadata.lastEditedAt ?? null,
    missingFields: Array.isArray(dbData.missingFields) ? dbData.missingFields : Array.isArray(metadata.missingFields) ? metadata.missingFields : [],
    distributionStores,
    metadata: { ...metadata, distributionStores },
    createdAt: dbData.createdAt.toISOString(),
    tracks: (dbData.tracks || []).map((track: any) => {
      const trackMeta = typeof track.metadata === "string" ? JSON.parse(track.metadata) : track.metadata || {};
      return {
        ...trackMeta,
        id: track.id,
        releaseId: track.releaseId,
        trackTitle: track.title,
        trackNumber: track.trackNumber || trackMeta.trackNumber || 1,
        audioUrl: track.audioUrl || trackMeta.audioUrl || "",
        primaryArtist: track.primaryArtist || trackMeta.primaryArtist || "",
        isrc: track.isrc,
        distributorStatus: track.distributorStatus,
        createdAt: track.createdAt.toISOString()
      };
    })
  };
}

export const STORE_STATUSES: StoreStatus[] = ["Live", "In Review", "Pending", "Denied", "Not Available", "Content ID Enabled", "Content ID Denied", "Takedown Requested", "Paused", "Removed"];
export const STORE_DENIAL_REASONS = ["Metadata mismatch", "Artwork issue", "Audio quality issue", "Rights / ownership issue", "Explicit content issue", "Artist profile mismatch", "Duplicate release", "Store policy issue", "Content ID conflict", "Territory restriction", "Other"] as const;

function objectList(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, any> => Boolean(item && typeof item === "object")) : [];
}

function sanitizeStoreStatuses(value: unknown): UserStoreStatus[] {
  return objectList(value).map((item) => ({
    platform: String(item.platform || ""),
    status: STORE_STATUSES.includes(item.status) ? item.status : "Pending",
    reason: item.reason ? String(item.reason) : null,
    userFacingNote: item.userFacingNote ? String(item.userFacingNote) : null,
    updatedAt: item.updatedAt ? String(item.updatedAt) : null
  })).filter((item) => item.platform);
}

export async function getAdminStoreStatusData(releaseId: number) {
  if (isPostgresPrisma()) {
    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { metadata: true } });
    if (!release) return null;
    const metadata = (release.metadata && typeof release.metadata === "object" ? release.metadata : {}) as Record<string, any>;
    return { stores: objectList(metadata.distributionStores) as AdminStoreStatus[], history: objectList(metadata.storeStatusHistory) as StoreStatusHistoryEntry[] };
  }
  const release = memory.releases.find((item) => item.id === releaseId);
  if (!release) return null;
  const metadata = release.metadata ?? {};
  return { stores: objectList(metadata.distributionStores) as AdminStoreStatus[], history: objectList(metadata.storeStatusHistory) as StoreStatusHistoryEntry[] };
}

export async function updateStoreStatuses(input: { releaseId: number; adminId: number; adminLabel: string; stores: Array<Pick<AdminStoreStatus, "platform" | "status" | "reason" | "userFacingNote" | "internalNote">> }) {
  const now = new Date().toISOString();
  const release = await getDetailedReleaseById(input.releaseId);
  if (!release) throw new Error("Release not found.");
  const adminData = await getAdminStoreStatusData(input.releaseId);
  const existing = adminData?.stores ?? [];
  const byPlatform = new Map(existing.map((store) => [store.platform, store]));
  const history = [...(adminData?.history ?? [])];
  const changed: AdminStoreStatus[] = [];

  for (const store of input.stores) {
    const previous = byPlatform.get(store.platform);
    const next: AdminStoreStatus = { ...store, reason: store.reason ?? null, userFacingNote: store.userFacingNote ?? null, internalNote: store.internalNote ?? null, updatedAt: now, updatedBy: input.adminId, updatedByLabel: input.adminLabel };
    byPlatform.set(store.platform, next);
    changed.push(next);
    history.unshift({ ...next, id: `${Date.now()}-${store.platform}-${history.length}`, oldStatus: previous?.status ?? null });
  }

  const stores = Array.from(byPlatform.values());
  if (isPostgresPrisma()) {
    const row = await prisma.release.findUnique({ where: { id: input.releaseId }, select: { metadata: true } });
    const metadata = (row?.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, any>;
    await prisma.release.update({ where: { id: input.releaseId }, data: { metadata: { ...metadata, distributionStores: stores, storeStatusHistory: history.slice(0, 250) } as any }, select: { id: true } });
  } else {
    const target = memory.releases.find((item) => item.id === input.releaseId);
    if (!target) throw new Error("Release not found.");
    target.metadata = { ...(target.metadata ?? {}), distributionStores: stores, storeStatusHistory: history.slice(0, 250) };
    target.distributionStores = sanitizeStoreStatuses(stores);
  }

  const liveStores = stores.filter((store) => store.status === "Live");
  if (liveStores.length > 0) {
    const requiredPlatforms = (release.platforms ?? []).filter((platform) => !["Facebook & Instagram", "Instagram / Facebook", "TikTok", "Audible Magic Identification", "Gracenote"].includes(platform));
    const allRequiredLive = requiredPlatforms.length > 0 && requiredPlatforms.every((platform) => stores.some((store) => store.platform === platform && store.status === "Live"));
    const automaticStatus: ReleaseStatus = allRequiredLive ? "live" : "partially_live";
    if (release.status !== automaticStatus) {
      await updateDetailedReleaseStatus(release.id, automaticStatus, allRequiredLive ? "All selected major stores confirmed Live." : `${liveStores.length} store(s) confirmed Live.`);
      await createReleaseAuditLog({ releaseId: release.id, userId: input.adminId, action: "STORE_STATUS_AUTOMATIC_RELEASE_TRANSITION", details: { from: release.status, to: automaticStatus, liveStores: liveStores.map((store) => store.platform), requiredPlatforms } });
    }
  }

  const platforms = changed.map((store) => store.platform);
  const denied = changed.find((store) => store.status === "Denied" || store.status === "Content ID Denied");
  const live = changed.length === 1 && changed[0].status === "Live" ? changed[0] : null;
  await createNotification({
    userId: release.userId,
    title: denied ? `Store denied: ${denied.platform}` : live ? `Store status updated: ${releaseDisplayName(release)}` : `Distribution stores updated: ${releaseDisplayName(release)}`,
    body: denied ? `${denied.platform} denied your release "${releaseDisplayName(release)}". Check the reason in your Distribution tab.` : live ? `Your release is now live on ${live.platform}.` : `Store statuses were updated for ${platforms.join(", ")}. Check your Distribution tab.`,
    type: "release",
    href: `/dashboard/releases?releaseId=${release.id}&tab=distribution`,
    actionLabel: denied ? "View reason" : "View distribution",
    priority: denied ? "high" : "normal",
    eventKey: `release:${release.id}:stores:${now}`,
    metadata: { releaseId: release.id, platforms, statuses: changed.map((store) => store.status) }
  });
  return { stores, history };
}

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
  hymnDistributionQueueMemory?: {
    entries: DistributionQueueEntry[];
    logs: DistributionQueueLog[];
  };
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
  distributionPlan: "one_time",
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
      audioUrl: sampleReleases[0]?.audioUrl ?? "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      duration: "03:12",
      bpm: 142,
      musicalKey: "Fm",
      explicitContent: true,
      dolbyAtmos: false,
      createdAt: sampleReleases[0]?.createdAt ?? new Date().toISOString()
    }
  ]
};

export const memory = globalState.hymnDistributionMemory ?? {
  releases: [initialRelease],
  subscriptions: [
    {
      id: 1,
      userId: 2,
      plan: "half_yearly",
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString(),
      status: "active" as const,
      releasesUsed: 1,
      releaseLimit: 4,
      artistLimit: 5,
      daysRemaining: 180,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  orders: [],
  distributionLogs: [],
  auditLogs: []
};

globalState.hymnDistributionMemory = memory;

const queueMemory = globalState.hymnDistributionQueueMemory ?? {
  entries: [],
  logs: []
};

globalState.hymnDistributionQueueMemory = queueMemory;

const queueStages: DistributionQueueStage[] = [
  "draft_submitted",
  "quality_check",
  "awaiting_approval",
  "approved",
  "sent_to_direnote",
  "processing",
  "delivered",
  "completed",
  "rejected"
];

const allQueueStageValues: DistributionQueueStage[] = ["draft_submitted", "quality_check", "awaiting_approval", "approved", "sent_to_direnote", "processing", "delivered", "completed", "rejected"];

const allowedQueueTransitions: Record<DistributionQueueStage, DistributionQueueStage[]> = {
  draft_submitted: allQueueStageValues,
  quality_check: allQueueStageValues,
  awaiting_approval: allQueueStageValues,
  approved: allQueueStageValues,
  sent_to_direnote: allQueueStageValues,
  processing: allQueueStageValues,
  delivered: allQueueStageValues,
  completed: allQueueStageValues,
  rejected: allQueueStageValues
};

function assertQueueStage(stage: string): DistributionQueueStage {
  if (!queueStages.includes(stage as DistributionQueueStage)) {
    throw new Error("Invalid distribution queue stage.");
  }
  return stage as DistributionQueueStage;
}

function releaseDisplayName(release: Release) {
  return release.releaseTitle || release.trackName || "Untitled release";
}

async function notifyReleaseStatusChange(release: Release, status: ReleaseStatus, note?: string | null) {
  const releaseName = releaseDisplayName(release);
  const redressalHref = `/dashboard/releases/${release.id}?tab=corrections`;
  const releaseHref = `/dashboard/releases/${release.id}`;
  const reason = status === "rejected" ? release.rejectionReason : status === "changes_requested" ? release.correctionReason : note;
  const baseMetadata = {
    releaseId: release.id,
    status,
    reason: reason ?? null,
    issueType: release.reviewIssues?.type ?? null,
    selectedFields: release.reviewIssues?.fields ?? []
  };
  const sendStatusEmail = async (event: "release_approved_by_hymn" | "release_changes_requested" | "release_rejected" | "release_sent_to_distributor" | "release_scheduled" | "release_live" | "release_distribution_failed") => {
    const user = await findUserById(release.userId);
    if (!user) return;
    await sendReleaseEmail(event, { to: user.email, userId: user.id, userName: user.name, releaseTitle: releaseName, artistName: release.artistName, releaseId: release.id, releaseStatus: status, releaseDate: release.releaseDate, manageReleaseUrl: emailAppUrl(`/dashboard/releases/${release.id}`), correctionUrl: emailAppUrl(`/dashboard/releases/${release.id}?tab=corrections`), rejectionReason: reason ?? undefined });
  };

  if (status === "under_review") {
    await createNotification({
      userId: release.userId,
      title: "Your release is under review",
      body: `HYMN has started reviewing “${releaseName}”.`,
      type: "release",
      href: `/dashboard/releases/${release.id}`,
      actionLabel: "View release",
      eventKey: `release:${release.id}:under_review`,
      metadata: baseMetadata
    });
    return;
  }

  if (status === "rejected") {
    await createNotification({
      userId: release.userId,
      title: `Release rejected: ${releaseName}`,
      body: `Your release "${releaseName}" was rejected. Check the reason and required corrections.`,
      type: "release",
      href: redressalHref,
      actionLabel: "Check reasons",
      priority: "high",
      eventKey: `release:${release.id}:status:rejected:${release.reviewedAt ?? "status"}`,
      metadata: baseMetadata
    });
    await sendStatusEmail("release_rejected");
    return;
  }

  if (status === "changes_requested") {
    const correctionCount = release.reviewIssues?.fields?.length ?? 0;
    await createNotification({
      userId: release.userId,
      title: `Fix required: ${releaseName}`,
      body: correctionCount > 0
        ? `${correctionCount} release detail${correctionCount === 1 ? "" : "s"} need${correctionCount === 1 ? "s" : ""} correction. Open redressal to fix the highlighted fields.`
        : "Corrections are required before distribution can continue. Open redressal to review and resubmit.",
      type: "release",
      href: redressalHref,
      actionLabel: "Fix release",
      priority: "high",
      eventKey: `release:${release.id}:status:changes_requested:${release.reviewedAt ?? "status"}`,
      metadata: baseMetadata
    });
    await sendStatusEmail("release_changes_requested");
    return;
  }

  // Approval and hand-off are internal workflow transitions. Customers continue
  // to see Under Review and are contacted only for action, scheduling, or go-live.
  if (status === "approved" || status === "sent_to_distributor" || status === "sent") return;

  if (status === "live") {
    await createNotification({
      userId: release.userId,
      title: `Release is live: ${releaseName}`,
      body: "Your release is now live or marked live in your HYMN dashboard.",
      type: "release",
      href: releaseHref,
      actionLabel: "View release",
      eventKey: `release:${release.id}:status:live`,
      metadata: baseMetadata
    });
    await sendStatusEmail("release_live");
    return;
  }

  if (status === "failed") {
    await createNotification({
      userId: release.userId,
      title: `Distribution issue: ${releaseName}`,
      body: "Your release could not be sent to the distributor. Check the issue and fix it.",
      type: "release",
      href: releaseHref,
      actionLabel: "Fix issue",
      priority: "high",
      eventKey: `release:${release.id}:status:failed`,
      metadata: baseMetadata
    });
    await sendStatusEmail("release_distribution_failed");
  }

  if (status === "scheduled") {
    await createNotification({ userId: release.userId, title: `Release scheduled: ${releaseName}`, body: `Your release is scheduled for ${release.releaseDate || "the selected release date"}. Platform availability may vary by DSP.`, type: "release", href: releaseHref, actionLabel: "View release", eventKey: `release:${release.id}:status:scheduled`, metadata: baseMetadata });
    await sendStatusEmail("release_scheduled");
  }
}

function releaseStatusForQueueStage(stage: DistributionQueueStage): ReleaseStatus {
  if (stage === "draft_submitted") return "submitted";
  if (stage === "quality_check" || stage === "awaiting_approval") return "under_review";
  if (stage === "approved") return "approved";
  if (stage === "sent_to_direnote") return "sent_to_distributor";
  if (stage === "processing") return "distributor_processing";
  if (stage === "delivered") return "awaiting_live_confirmation";
  if (stage === "completed") return "live";
  return "rejected";
}

function normalizeQueueEntry(entry: any): DistributionQueueEntry {
  const history = Array.isArray(entry.stageHistory) ? entry.stageHistory : [];
  return {
    id: entry.id,
    releaseId: entry.releaseId,
    currentStage: entry.currentStage as DistributionQueueStage,
    qualityCheckNotes: entry.qualityCheckNotes ?? null,
    approvalNotes: entry.approvalNotes ?? null,
    direnoteRequestId: entry.direnoteRequestId ?? null,
    direnoteResponse: entry.direnoteResponse ?? null,
    submissionId: entry.submissionId ?? null,
    apiErrorMessage: entry.apiErrorMessage ?? null,
    stageHistory: history,
    operatorId: entry.operatorId ?? null,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : entry.createdAt,
    updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : entry.updatedAt
  };
}

function getPool() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const isPostgres = /^postgres(?:ql)?:\/\//i.test(databaseUrl || "");
  const looksLikeExample = isPostgres || !databaseUrl || databaseUrl === "mysql://user:password@localhost:3306/hymn";
  if (!isPostgres && process.env.NODE_ENV === "production") {
    throw new Error("Legacy MySQL distribution persistence is disabled in production; configure PostgreSQL through DATABASE_URL.");
  }
  if (looksLikeExample) return null;
  if (!globalState.hymnDistributionPool) {
    globalState.hymnDistributionPool = mysql.createPool({ uri: databaseUrl, connectionLimit: 10 });
  }
  return globalState.hymnDistributionPool;
}

function nextId(items: { id: number }[]) {
  return items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
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
  if (isPostgresPrisma()) {
    const [currentlyReviewing, pendingQueue] = await Promise.all([
      prisma.release.count({ where: { status: "UNDER_REVIEW" } }),
      prisma.release.count({ where: { status: { in: ["SUBMITTED", "IN_QC_QUEUE", "QUEUED_FOR_DISTRIBUTION"] } } })
    ]);
    return { currentlyReviewing, pendingQueue, nextBatchIn: "Not scheduled", averageApprovalTime: "Not available" };
  }
  const pool = getPool();
  if (!pool) return queueSummaryFromMemory();
  const [queueRows] = await pool.query("SELECT COUNT(*) AS total FROM release_queue WHERE status IN ('submitted','in_queue')");
  const [reviewRows] = await pool.query("SELECT COUNT(*) AS total FROM releases WHERE status = 'under_review'");
  return {
    currentlyReviewing: Number((reviewRows as Array<{ total: number }>)[0]?.total ?? 0),
    nextBatchIn: "Not scheduled",
    averageApprovalTime: "Not available",
    pendingQueue: Number((queueRows as Array<{ total: number }>)[0]?.total ?? 0)
  };
}

export async function listDetailedReleasesByUser(userId: number): Promise<Release[]> {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      const dbReleases = await legacyCompatibleReleaseRows("user", userId);
      return dbReleases.map(deserializeRelease);
    }
    return memory.releases.filter((release) => release.userId === userId).sort((a, b) => b.id - a.id);
  }
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
  if (!pool) {
    if (isPostgresPrisma()) {
      const dbRelease = await legacyCompatibleReleaseForUser(userId, releaseId);
      return dbRelease ? deserializeRelease(dbRelease) : null;
    }
    return memory.releases.find((release) => release.userId === userId && release.id === releaseId) ?? null;
  }
  const releases = await listDetailedReleasesByUser(userId);
  return releases.find((release) => release.id === releaseId) ?? null;
}

const duplicateUnsafeMetadataKeys = new Set(["direnoteResponse", "direnoteValidationErrors", "reviewIssues", "reviewHistory", "analytics", "earnings", "audit"]);

function duplicateSafeValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !duplicateUnsafeMetadataKeys.has(key)));
}

export async function duplicateReleaseForUser(userId: number, releaseId: number) {
  const source = await getDetailedReleaseByUserId(userId, releaseId);
  if (!source) return null;
  const { id: _id, userId: _userId, status: _status, createdAt: _createdAt, queuePosition: _queuePosition,
    estimatedReviewTime: _estimatedReviewTime, tracks, reviewIssues: _reviewIssues, rejectionReason: _rejectionReason,
    correctionReason: _correctionReason, reviewedAt: _reviewedAt, reviewedBy: _reviewedBy,
    distributorReleaseId: _distributorReleaseId, upcCode: _upcCode, ...safeSource } = source;
  return saveDraftDistributionRelease({
    userId,
    metadata: {
      ...safeSource,
      releaseTitle: `${source.releaseTitle || source.trackName || "Untitled release"} - Copy`,
      trackName: `${source.releaseTitle || source.trackName || "Untitled release"} - Copy`,
      paymentStatus: "pending",
      metadata: duplicateSafeValue(source.metadata),
      tracks: (tracks ?? []).map((track) => {
        const { id: _trackId, releaseId: _trackReleaseId, createdAt: _trackCreatedAt, isrc: _isrc,
          distributorStatus: _distributorStatus, ...safeTrack } = track;
        return { ...safeTrack, metadata: duplicateSafeValue(track.metadata) };
      })
    } as any
  });
}

export async function deleteDraftReleaseForUser(userId: number, releaseId: number): Promise<"deleted" | "blocked" | "not_found"> {
  const source = await getDetailedReleaseByUserId(userId, releaseId);
  if (!source) return "not_found";
  if (source.status !== "draft") return "blocked";
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) await prisma.release.delete({ where: { id: releaseId }, select: { id: true } });
    else {
      const index = memory.releases.findIndex((release) => release.id === releaseId && release.userId === userId);
      if (index < 0) return "not_found";
      memory.releases.splice(index, 1);
    }
    return "deleted";
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM tracks WHERE release_id = ?", [releaseId]);
    const [result] = await connection.query("DELETE FROM releases WHERE id = ? AND user_id = ? AND status = 'draft'", [releaseId, userId]);
    if ((result as { affectedRows?: number }).affectedRows !== 1) { await connection.rollback(); return "not_found"; }
    await connection.commit();
    return "deleted";
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export async function listAllDetailedReleases(): Promise<Release[]> {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      const dbReleases = await legacyCompatibleReleaseRows("all");
      return dbReleases.map(deserializeRelease);
    }
    const releases = [...memory.releases].sort((a, b) => b.id - a.id);
    return Promise.all(releases.map(async (release) => ({ ...release, ownerEmail: release.ownerEmail ?? (await findUserById(release.userId))?.email ?? null })));
  }
  const [rows] = await pool.query(
    `SELECT r.id, r.user_id AS userId, r.artist_name AS artistName, r.track_name AS trackName, r.release_title AS releaseTitle,
            r.release_type AS releaseType, r.audio_url AS audioUrl, r.artwork_url AS artworkUrl, r.release_date AS releaseDate,
            r.original_release_date AS originalReleaseDate, r.record_label_name AS labelName, r.primary_genre AS primaryGenre,
            r.secondary_genre AS secondaryGenre, r.language, r.mood, r.platforms, r.youtube_content_id_enabled AS youtubeContentIdEnabled,
            r.youtube_content_id_channel_url AS youtubeContentIdChannelUrl, r.monetisation_accepted AS monetisationAccepted,
            r.monetisation_clauses AS monetisationClauses, r.territory, r.upc_code AS upcCode,
            r.release_timing AS releaseTiming, r.copyright_owner AS copyrightOwner, r.publishing_rights AS publishingRights,
            r.payment_model AS paymentModel, r.payment_status AS paymentStatus, r.distribution_plan AS distributionPlan,
             r.status, q.position AS queuePosition, q.estimated_review_time AS estimatedReviewTime, r.created_at AS createdAt,
             u.email AS ownerEmail
     FROM releases r
     LEFT JOIN users u ON u.id = r.user_id
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
  if (isPostgresPrisma()) {
    const tracks = await prisma.track.findMany({ where: { releaseId }, orderBy: { trackNumber: "asc" } });
    return tracks.map((track) => deserializeRelease({ id: releaseId, userId: 0, title: "", artistName: "", genre: "", status: "DRAFT", createdAt: new Date(0), tracks: [track] }).tracks?.[0]).filter((track): track is ReleaseTrack => Boolean(track));
  }
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

export async function updateDetailedReleaseStatus(releaseId: number, status: ReleaseStatus, note?: string, review?: {
  reason: string;
  issueType: NonNullable<Release["reviewIssues"]>["type"];
  severity: NonNullable<Release["reviewIssues"]>["severity"];
  fields: NonNullable<Release["reviewIssues"]>["fields"];
  adminInternalNote?: string;
  reviewedBy?: string | null;
}, options?: { manualOverride?: boolean; actorType?: string; actorId?: number | null }) {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      const reviewIssues = review ? { type: review.issueType, severity: review.severity, fields: review.fields } : undefined;
      await prisma.$transaction(async (tx) => {
        const current = await tx.release.findUnique({ where: { id: releaseId }, select: { status: true, version: true } });
        if (!current) throw new Error("Release not found.");
        const previousStatus = current.status.toLowerCase() as ReleaseStatus;
        transitionReleaseStatus({ currentStatus: previousStatus, nextStatus: status, reason: note, manualOverride: options?.manualOverride });
        if (previousStatus === status) return;
        const changed = await tx.release.updateMany({ where: { id: releaseId, version: current.version }, data: {
          status: status.toUpperCase() as any, version: { increment: 1 },
          ...(review ? { rejectionReason: status === "rejected" ? review.reason : undefined, correctionReason: status === "changes_requested" ? review.reason : undefined, reviewIssues: reviewIssues as any, adminInternalNote: review.adminInternalNote || null, reviewedAt: new Date(), reviewedBy: review.reviewedBy ?? null } : {})
        } });
        if (changed.count !== 1) throw new Error("Release changed concurrently. Refresh and retry.");
        await tx.releaseStatusTransition.create({ data: { releaseId, previousStatus: current.status, newStatus: status.toUpperCase() as any, actorType: options?.actorType ?? (review?.reviewedBy ? "admin" : "system"), actorId: options?.actorId ?? null, reason: note?.trim() || null, metadata: { manualOverride: Boolean(options?.manualOverride) } } });
        await tx.auditLog.create({ data: { actorId: options?.actorId ?? null, action: "RELEASE_STATUS_TRANSITION", entity: "release", entityId: String(releaseId), metadata: { previousStatus, newStatus: status, reason: note?.trim() || null, version: current.version + 1, manualOverride: Boolean(options?.manualOverride) } } });
      });
      const release = await getDetailedReleaseById(releaseId);
      if (release) await notifyReleaseStatusChange(release, status, note);
      return release;
    }
    const release = memory.releases.find((item) => item.id === releaseId);
    if (!release) return null;
    release.status = status;
    if (review) {
      if (status === "rejected") release.rejectionReason = review.reason;
      if (status === "changes_requested") release.correctionReason = review.reason;
      release.reviewIssues = { type: review.issueType, severity: review.severity, fields: review.fields };
      release.adminInternalNote = review.adminInternalNote || null;
      release.reviewedAt = new Date().toISOString();
      release.reviewedBy = review.reviewedBy ?? null;
    }
    if (status === "in_queue" && release.queuePosition == null) {
      release.queuePosition = memory.releases.filter((item) => item.status === "submitted" || item.status === "in_queue").length;
    }
    await notifyReleaseStatusChange(release, status, note);
    return release;
  }
  await pool.query("UPDATE releases SET status = ? WHERE id = ?", [status, releaseId]);
  if (status === "in_queue") {
    await pool.query("UPDATE release_queue SET status = 'in_queue' WHERE release_id = ?", [releaseId]);
  }
  const releases = await listAllDetailedReleases();
  const release = releases.find((item) => item.id === releaseId) ?? null;
  if (release) await notifyReleaseStatusChange(release, status, note);
  return release;
}

export async function createDistributionOrder(input: { userId: number; plan: SubscriptionPlan; amount: number; creditsUsed?: number; razorpayOrderId: string; releaseId?: number; }) {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      const dbOrder = await prisma.$transaction(async (tx) => {
        if (input.releaseId) {
          const bound = await tx.distributionOrder.findUnique({ where: { releaseId: input.releaseId } });
          if (bound) {
            if (bound.userId !== input.userId) throw new Error("This release draft is attached to another customer's checkout.");
            if (bound.fulfilledAt || bound.paymentStatus === "paid" || bound.razorpayPaymentId) throw new Error("A captured payment is already attached to this release. Retry submission instead of creating another payment.");
            const detached = await tx.distributionOrder.updateMany({
              where: { id: bound.id, releaseId: input.releaseId, fulfilledAt: null, paymentStatus: { in: ["created", "authorized"] }, razorpayPaymentId: null },
              data: { releaseId: null },
            });
            if (detached.count !== 1) throw new Error("The release checkout changed while the order was being prepared. Please retry.");
          }
        }
        return tx.distributionOrder.create({
          data: { userId: input.userId, plan: input.plan, amount: input.amount, creditsUsed: input.creditsUsed ?? 0, paymentStatus: 'created', razorpayOrderId: input.razorpayOrderId, releaseId: input.releaseId }
        });
      });
      return { id: dbOrder.id, userId: input.userId, plan: input.plan, amount: input.amount, paymentStatus: dbOrder.paymentStatus, razorpayOrderId: dbOrder.razorpayOrderId } as any;
    }
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
    "INSERT INTO distribution_orders (user_id, release_id, plan, amount, credits_used, razorpay_order_id, payment_status) VALUES (?, ?, ?, ?, ?, ?, 'created')",
    [input.userId, input.releaseId ?? null, input.plan, input.amount, input.creditsUsed ?? 0, input.razorpayOrderId]
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
    if (isPostgresPrisma()) {
      const orders = await prisma.distributionOrder.findMany({ orderBy: { createdAt: "desc" } });
      return orders.map((order) => ({ ...order, plan: order.plan as SubscriptionPlan, paymentStatus: order.paymentStatus as DistributionOrder["paymentStatus"], createdAt: order.createdAt.toISOString() }));
    }
    return [...memory.orders].sort((a, b) => b.id - a.id);
  }
  const [rows] = await pool.query(
    "SELECT id, user_id AS userId, release_id AS releaseId, plan, amount, razorpay_order_id AS razorpayOrderId, razorpay_payment_id AS razorpayPaymentId, payment_status AS paymentStatus, created_at AS createdAt FROM distribution_orders ORDER BY created_at DESC"
  );
  return rows as DistributionOrder[];
}

export async function listPaidDistributionPlansByUser(userId: number): Promise<string[]> {
  if (isPostgresPrisma()) {
    const [orders, releases] = await Promise.all([
      prisma.distributionOrder.findMany({ where: { userId, paymentStatus: "paid" }, select: { plan: true } }),
      prisma.release.findMany({ where: { userId, paymentStatus: "paid" }, select: { metadata: true } })
    ]);
    const releasePlans = releases.map((release) => {
      const metadata = release.metadata && typeof release.metadata === "object" ? release.metadata as Record<string, any> : {};
      return String(metadata.distributionPlan ?? metadata.plan ?? metadata.paymentModel ?? "");
    });
    return [...orders.map((order) => order.plan), ...releasePlans].filter(Boolean);
  }
  const pool = getPool();
  if (!pool) {
    return [
      ...memory.orders.filter((order) => order.userId === userId && order.paymentStatus === "paid").map((order) => order.plan),
      ...memory.releases.filter((release) => release.userId === userId && release.paymentStatus === "paid").map((release) => release.distributionPlan ?? release.paymentModel ?? "")
    ].filter(Boolean);
  }
  const [rows] = await pool.query("SELECT plan FROM distribution_orders WHERE user_id = ? AND payment_status = 'paid'", [userId]);
  return (rows as Array<{ plan: string }>).map((row) => row.plan);
}

export async function markDistributionOrderPaid(orderId: string, paymentId: string) {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      const order = await prisma.distributionOrder.findFirst({ where: { razorpayOrderId: orderId } });
      if (order) {
        await prisma.distributionOrder.update({
          where: { id: order.id },
          data: { paymentStatus: 'paid', razorpayPaymentId: paymentId }
        });
      }
      return;
    }
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
  if (plan === "one_time") return null;
  const { limit, expiryDays } = planLimits(plan);
  const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  if (isPostgresPrisma()) {
    return prisma.subscription.upsert({
      where: { userId },
      update: { plan, expiryDate, releaseLimit: limit, status: "active" },
      create: { userId, plan, expiryDate, releaseLimit: limit, releasesUsed: 0, status: "active" }
    });
  }
  const pool = getPool();
  if (!pool) {
    const existing = memory.subscriptions.find((item) => item.userId === userId);
    if (existing) {
      existing.plan = plan as any;
      existing.expiryDate = expiryDate.toISOString();
      existing.releaseLimit = limit;
      return existing;
    }
    const subscription: Subscription = {
      id: nextId(memory.subscriptions),
      userId,
      plan: plan as any,
      expiryDate: expiryDate.toISOString(),
      status: "active",
      releasesUsed: 0,
      releaseLimit: limit,
      artistLimit: 5,
      daysRemaining: expiryDays,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    memory.subscriptions.unshift(subscription);
    return subscription;
  }
  throw new Error("Unsupported legacy subscription persistence state.");
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
    if (isPostgresPrisma()) {
      const { tracks, ...rest } = input.metadata;
      const dbRelease = await prisma.release.upsert({
        where: { id: input.draftReleaseId || -1 },
        create: {
          userId: input.userId,
          title: input.metadata.releaseTitle || input.metadata.trackName || "Untitled Release",
          artistName: input.metadata.artistName || "",
          genre: input.metadata.primaryGenre || "",
          status: "DRAFT",
          releaseType: input.metadata.releaseType || "single",
          artworkUrl: input.metadata.artworkUrl || null,
          audioUrl: input.metadata.audioUrl || null,
          paymentStatus: input.metadata.paymentStatus || "pending",
          releaseDate: input.metadata.releaseDate ? new Date(input.metadata.releaseDate) : new Date(),
          metadata: rest as any
        },
        update: {
          title: input.metadata.releaseTitle || input.metadata.trackName || "Untitled Release",
          artistName: input.metadata.artistName || "",
          genre: input.metadata.primaryGenre || "",
          status: "DRAFT",
          releaseType: input.metadata.releaseType || "single",
          artworkUrl: input.metadata.artworkUrl || null,
          audioUrl: input.metadata.audioUrl || null,
          paymentStatus: input.metadata.paymentStatus || "pending",
          metadata: rest as any
        },
        select: { id: true }
      });
      
      if (tracks && tracks.length) {
        await prisma.track.deleteMany({ where: { releaseId: dbRelease.id } });
        await prisma.track.createMany({
          data: tracks.map((t, i) => {
            const trackRest = { ...t } as any;
            delete trackRest.id;
            delete trackRest.releaseId;
            return {
              releaseId: dbRelease.id,
              title: t.trackTitle || "Untitled Track",
              trackNumber: t.trackNumber || i + 1,
              audioUrl: t.audioUrl,
              primaryArtist: t.primaryArtist,
              metadata: trackRest
            };
          })
        });
      }
      return (await getDetailedReleaseByUserId(input.userId, dbRelease.id)) as any;
    }
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
    typeof input.metadata.mood === "string" ? input.metadata.mood : (typeof existingRelease?.mood === "string" ? existingRelease.mood : ""),
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
    input.metadata.distributionPlan ?? existingRelease?.distributionPlan ?? "one_time",
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
      [...releaseValues.slice(1), input.draftReleaseId ?? releaseId, input.userId]
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
    if (isPostgresPrisma()) {
      const { tracks, ...rest } = input.metadata;
      const dbRelease = await prisma.release.create({
        data: {
          userId: input.userId,
          title: input.metadata.releaseTitle || input.metadata.tracks[0]?.trackTitle || "Untitled Release",
          artistName: input.metadata.artistName || "",
          genre: input.metadata.primaryGenre || "",
          status: "SUBMITTED",
          releaseType: input.metadata.releaseType || "single",
          artworkUrl: input.metadata.artworkUrl || null,
          audioUrl: input.metadata.tracks[0]?.audioUrl || null,
          paymentStatus: "paid",
          releaseDate: input.metadata.releaseDate ? new Date(input.metadata.releaseDate) : new Date(),
          metadata: { ...rest, paymentStatus: "paid", submittedAt: new Date().toISOString() } as any
        },
        select: { id: true }
      });
      
      if (tracks && tracks.length) {
        await prisma.track.createMany({
          data: tracks.map((t, i) => {
            const trackRest = { ...t } as any;
            delete trackRest.id;
            delete trackRest.releaseId;
            return {
              releaseId: dbRelease.id,
              title: t.trackTitle || "Untitled Track",
              trackNumber: t.trackNumber || i + 1,
              audioUrl: t.audioUrl,
              primaryArtist: t.primaryArtist,
              metadata: trackRest
            };
          })
        });
      }
      
      const order = await prisma.distributionOrder.findFirst({ where: { razorpayOrderId: input.razorpayOrderId } });
      if (order) {
        await prisma.distributionOrder.update({
          where: { id: order.id },
          data: { paymentStatus: "paid", razorpayPaymentId: input.razorpayPaymentId }
        });
      }
      await createDistributionQueueEntry({
        releaseId: dbRelease.id,
        initialStage: "quality_check",
        notes: "Release submitted after payment verification.",
        metadata: { paymentModel: input.metadata.paymentModel, plan: input.metadata.distributionPlan }
      });
      return (await getDetailedReleaseByUserId(input.userId, dbRelease.id)) as any;
    }
    const releaseId = nextId(memory.releases);
    const release: Release = {
      ...input.metadata,
      id: releaseId,
      userId: input.userId,
      trackName: input.metadata.tracks[0]?.trackTitle ?? input.metadata.releaseTitle,
      audioUrl: input.metadata.tracks[0]?.audioUrl ?? "",
      status: "under_review",
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
    await createDistributionQueueEntry({
      releaseId,
      initialStage: "quality_check",
      notes: "Release submitted after payment verification.",
      metadata: { paymentModel: input.metadata.paymentModel, plan: input.metadata.distributionPlan }
    });
    await createOrRefreshSubscription(input.userId, input.metadata.distributionPlan ?? "one_time");
    return release;
  }

  const [result] = await pool.query(
    `INSERT INTO releases (
      user_id, artist_name, track_name, release_title, release_type, audio_url, artwork_url, release_date, original_release_date,
      record_label_name, primary_genre, secondary_genre, language, mood, platforms, youtube_content_id_enabled, youtube_content_id_channel_url,
      monetisation_accepted, monetisation_clauses, territory, upc_code, release_timing, copyright_owner, publishing_rights, payment_model, payment_status, distribution_plan, status,
      ownership_confirmed, no_unauthorized_samples, collaborators_credited, platform_compliant, hymn_not_liable,
      agreed_to_terms, false_metadata_acknowledged, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, 'under_review', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
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
      typeof input.metadata.mood === "string" ? input.metadata.mood : "",
      JSON.stringify(input.metadata.platforms),
      input.metadata.territory ?? null,
      input.metadata.upcCode ?? null,
      input.metadata.releaseTiming ?? null,
      input.metadata.copyrightOwner ?? null,
      input.metadata.publishingRights ?? null,
      input.metadata.paymentModel ?? "one_time",
      input.metadata.distributionPlan ?? "one_time",
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
    "INSERT INTO release_queue (release_id, position, estimated_review_time, status) VALUES (?, ?, '24-48 hours', 'under_review')",
    [releaseId, queuePosition]
  );
  await pool.query(
    "UPDATE distribution_orders SET release_id = ?, razorpay_payment_id = ?, payment_status = 'paid' WHERE razorpay_order_id = ?",
    [releaseId, input.razorpayPaymentId, input.razorpayOrderId]
  );
  await createOrRefreshSubscription(input.userId, input.metadata.distributionPlan ?? "one_time");

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
    if (isPostgresPrisma()) {
      const { tracks, ...rest } = input.metadata;
      await prisma.$transaction(async (tx) => {
        await tx.release.update({
          where: { id: input.releaseId },
          data: {
            title: input.metadata.releaseTitle || input.metadata.trackName || "Untitled Release",
            artistName: input.metadata.artistName,
            genre: input.metadata.primaryGenre || input.metadata.genre || "",
            releaseType: input.metadata.releaseType,
            artworkUrl: input.metadata.artworkUrl || existingRelease.artworkUrl || null,
            audioUrl: input.metadata.tracks[0]?.audioUrl || existingRelease.audioUrl || null,
            releaseDate: input.metadata.releaseDate ? new Date(input.metadata.releaseDate) : new Date(existingRelease.releaseDate),
            paymentStatus: "paid",
            metadata: { ...rest, submittedAt: new Date().toISOString() } as any,
            lastEditedAt: new Date()
          },
          select: { id: true }
        });
        await tx.track.deleteMany({ where: { releaseId: input.releaseId } });
        if (tracks.length) {
          await tx.track.createMany({
            data: tracks.map((track, index) => {
              const trackMetadata = { ...track } as any;
              return {
                releaseId: input.releaseId,
                title: track.trackTitle || `Track ${index + 1}`,
                trackNumber: track.trackNumber || index + 1,
                primaryArtist: track.primaryArtist || input.metadata.artistName,
                audioUrl: track.audioUrl || null,
                isrc: track.isrc || null,
                metadata: trackMetadata
              };
            })
          });
        }
      });
      const reviewReason = "Paid release metadata was submitted for review.";
      const currentStatus = String(existingRelease.status ?? "").trim().toLowerCase();
      if (currentStatus === "changes_requested" || currentStatus === "rejected") await updateDetailedReleaseStatus(input.releaseId, "resubmitted", reviewReason);
      else if (currentStatus === "draft") await updateDetailedReleaseStatus(input.releaseId, "submitted", reviewReason);
      await updateDetailedReleaseStatus(input.releaseId, "under_review", reviewReason);
      await createDistributionQueueEntry({ releaseId: input.releaseId, initialStage: "quality_check", notes: "Draft completed and submitted for HYMN review." });
      return getDetailedReleaseByUserId(input.userId, input.releaseId);
    }
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
      typeof input.metadata.mood === "string" ? input.metadata.mood : "",
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
      input.metadata.distributionPlan ?? "one_time",
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

export async function createDistributionQueueEntry(input: {
  releaseId: number;
  initialStage?: DistributionQueueStage;
  operatorId?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const initialStage = assertQueueStage(input.initialStage ?? "draft_submitted");
  const now = new Date();
  const pool = getPool();

  if (!pool) {
    if (isPostgresPrisma()) {
      const release = await prisma.release.findUnique({ where: { id: input.releaseId }, select: { id: true } });
      if (!release) throw new Error("Release not found.");

      const entry = await prisma.distributionQueueEntry.upsert({
        where: { releaseId: input.releaseId },
        create: {
          releaseId: input.releaseId,
          currentStage: initialStage,
          operatorId: input.operatorId ?? null,
          stageHistory: [],
          timestamps: { [initialStage]: now.toISOString() }
        },
        update: {
          currentStage: initialStage,
          operatorId: input.operatorId ?? null,
          timestamps: { [initialStage]: now.toISOString() }
        }
      });

      await prisma.distributionQueueLog.create({
        data: {
          queueEntryId: entry.id,
          stage: initialStage,
          stageStartTime: now,
          operatorId: input.operatorId ?? null,
          notes: input.notes ?? null,
          metadata: input.metadata as any
        }
      });

      await updateDetailedReleaseStatus(input.releaseId, releaseStatusForQueueStage(initialStage), input.notes ?? `Distribution queue entered ${initialStage}.`);

      return normalizeQueueEntry({ ...entry, stageHistory: await listDistributionQueueLogs(entry.id) });
    }

    const existing = queueMemory.entries.find((entry) => entry.releaseId === input.releaseId);
    const entry = existing ?? {
      id: nextId(queueMemory.entries),
      releaseId: input.releaseId,
      currentStage: initialStage,
      stageHistory: [],
      operatorId: input.operatorId ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    entry.currentStage = initialStage;
    entry.operatorId = input.operatorId ?? null;
    entry.updatedAt = now.toISOString();
    if (!existing) queueMemory.entries.unshift(entry);

    const log: DistributionQueueLog = {
      id: nextId(queueMemory.logs),
      queueEntryId: entry.id,
      stage: initialStage,
      stageStartTime: now.toISOString(),
      stageEndTime: null,
      operatorId: input.operatorId ?? null,
      notes: input.notes ?? undefined,
      metadata: input.metadata,
      createdAt: now.toISOString()
    };
    queueMemory.logs.unshift(log);
    entry.stageHistory = listDistributionQueueLogsFromMemory(entry.id);
    const release = memory.releases.find((item) => item.id === input.releaseId);
    if (release) release.status = releaseStatusForQueueStage(initialStage);
    return entry;
  }

  return null;
}

function listDistributionQueueLogsFromMemory(queueEntryId: number) {
  return queueMemory.logs
    .filter((log) => log.queueEntryId === queueEntryId)
    .sort((a, b) => new Date(a.stageStartTime).getTime() - new Date(b.stageStartTime).getTime());
}

export async function listDistributionQueueLogs(queueEntryId: number): Promise<DistributionQueueLog[]> {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      const logs = await prisma.distributionQueueLog.findMany({
        where: { queueEntryId },
        orderBy: { stageStartTime: "asc" }
      });
      return logs.map((log) => ({
        id: log.id,
        queueEntryId: log.queueEntryId,
        stage: log.stage as DistributionQueueStage,
        stageStartTime: log.stageStartTime.toISOString(),
        stageEndTime: log.stageEndTime?.toISOString() ?? null,
        operatorId: log.operatorId ?? null,
        notes: log.notes ?? undefined,
        metadata: log.metadata as Record<string, any> | undefined,
        createdAt: log.createdAt.toISOString()
      }));
    }
    return listDistributionQueueLogsFromMemory(queueEntryId);
  }
  return [];
}

export async function listDistributionQueueEntries(input: { userId?: number; stage?: DistributionQueueStage } = {}) {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      const entries = await prisma.distributionQueueEntry.findMany({
        where: {
          ...(input.stage ? { currentStage: input.stage } : {}),
          ...(input.userId ? { release: { userId: input.userId } } as any : {})
        },
        orderBy: { updatedAt: "desc" }
      });
      return Promise.all(entries.map(async (entry) => normalizeQueueEntry({ ...entry, stageHistory: await listDistributionQueueLogs(entry.id) })));
    }

    const allowedReleaseIds = input.userId
      ? new Set(memory.releases.filter((release) => release.userId === input.userId).map((release) => release.id))
      : null;
    return queueMemory.entries
      .filter((entry) => (!allowedReleaseIds || allowedReleaseIds.has(entry.releaseId)) && (!input.stage || entry.currentStage === input.stage))
      .map((entry) => ({ ...entry, stageHistory: listDistributionQueueLogsFromMemory(entry.id) }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return [];
}

export async function transitionDistributionQueueEntry(input: {
  entryId?: number;
  releaseId?: number;
  nextStage: DistributionQueueStage;
  operatorId?: number | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  syncReleaseStatus?: boolean;
}) {
  const nextStage = assertQueueStage(input.nextStage);
  const pool = getPool();
  const now = new Date();

  if (!pool) {
    if (isPostgresPrisma()) {
      const entry = input.entryId
        ? await prisma.distributionQueueEntry.findUnique({ where: { id: input.entryId } })
        : await prisma.distributionQueueEntry.findUnique({ where: { releaseId: input.releaseId ?? -1 } });
      if (!entry) throw new Error("Distribution queue entry not found.");

      const currentStage = assertQueueStage(entry.currentStage);
      if (currentStage !== nextStage && !allowedQueueTransitions[currentStage]?.includes(nextStage)) {
        throw new Error(`Cannot move from ${currentStage.replace(/_/g, " ")} to ${nextStage.replace(/_/g, " ")}.`);
      }

      await prisma.distributionQueueLog.updateMany({
        where: { queueEntryId: entry.id, stage: currentStage, stageEndTime: null },
        data: { stageEndTime: now }
      });
      await prisma.distributionQueueLog.create({
        data: {
          queueEntryId: entry.id,
          stage: nextStage,
          stageStartTime: now,
          operatorId: input.operatorId ?? null,
          notes: input.notes ?? null,
          metadata: input.metadata as any
        }
      });

      const timestamps = typeof entry.timestamps === "object" && entry.timestamps ? entry.timestamps as Record<string, unknown> : {};
      const updated = await prisma.distributionQueueEntry.update({
        where: { id: entry.id },
        data: {
          currentStage: nextStage,
          operatorId: input.operatorId ?? null,
          timestamps: { ...timestamps, [nextStage]: now.toISOString() } as any,
          qualityCheckNotes: nextStage === "quality_check" ? input.notes ?? entry.qualityCheckNotes : entry.qualityCheckNotes,
          approvalNotes: nextStage === "approved" ? input.notes ?? entry.approvalNotes : entry.approvalNotes,
          apiErrorMessage: nextStage === "rejected" ? input.notes ?? entry.apiErrorMessage : entry.apiErrorMessage
        }
      });

      if (input.syncReleaseStatus !== false) {
        await updateDetailedReleaseStatus(entry.releaseId, releaseStatusForQueueStage(nextStage), input.notes ?? `Distribution queue moved to ${nextStage}.`);
      }

      return normalizeQueueEntry({ ...updated, stageHistory: await listDistributionQueueLogs(updated.id) });
    }

    const entry = queueMemory.entries.find((item) => item.id === input.entryId || item.releaseId === input.releaseId);
    if (!entry) throw new Error("Distribution queue entry not found.");
    if (entry.currentStage !== nextStage && !allowedQueueTransitions[entry.currentStage]?.includes(nextStage)) {
      throw new Error(`Cannot move from ${entry.currentStage.replace(/_/g, " ")} to ${nextStage.replace(/_/g, " ")}.`);
    }

    const openLog = queueMemory.logs.find((log) => log.queueEntryId === entry.id && log.stage === entry.currentStage && !log.stageEndTime);
    if (openLog) openLog.stageEndTime = now.toISOString();
    queueMemory.logs.unshift({
      id: nextId(queueMemory.logs),
      queueEntryId: entry.id,
      stage: nextStage,
      stageStartTime: now.toISOString(),
      stageEndTime: null,
      operatorId: input.operatorId ?? null,
      notes: input.notes ?? undefined,
      metadata: input.metadata,
      createdAt: now.toISOString()
    });
    entry.currentStage = nextStage;
    entry.operatorId = input.operatorId ?? null;
    entry.updatedAt = now.toISOString();
    entry.stageHistory = listDistributionQueueLogsFromMemory(entry.id);
    if (input.syncReleaseStatus !== false) {
      const release = memory.releases.find((item) => item.id === entry.releaseId);
      if (release) release.status = releaseStatusForQueueStage(nextStage);
    }
    return entry;
  }

  return null;
}
export function getDistributionPricing(plan: SubscriptionPlan, trackCount: number, releaseType: Release["releaseType"], platforms: string[] = [], options?: { youtubeContentIdEnabled?: boolean }) {
  void releaseType;
  const ugcAddonPrice = getUgcAddonPrice(platforms, plan, options);
  if (plan !== "one_time") {
    return planLimits(plan).amount + ugcAddonPrice;
  }
  return getTrackPricingQuote(trackCount).finalPrice + ugcAddonPrice;
}

export async function getDetailedReleaseById(releaseId: number): Promise<Release | null> {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      const dbRelease = await legacyCompatibleReleaseById(releaseId);
      return dbRelease ? deserializeRelease(dbRelease) : null;
    }
    const release = memory.releases.find((item: any) => item.id === releaseId) ?? null;
    if (!release) return null;
    return { ...release, ownerEmail: release.ownerEmail ?? (await findUserById(release.userId))?.email ?? null };
  }
  const releases = await listAllDetailedReleases();
  return releases.find((release: any) => release.id === releaseId) ?? null;
}


export async function logDistributionEvent(input: {
  releaseId: number;
  action?: string;
  httpStatus?: number | null;
  responseRaw?: string;
  createdByAdminId?: number | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
  warnings?: string[] | null;
  errors?: string[] | null;
  success: boolean;
}) {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      return prisma.direNoteLog.create({ data: {
        releaseId: input.releaseId,
        action: input.action ?? "release_submission",
        httpStatus: input.httpStatus ?? null,
        success: input.success,
        requestPayloadRedacted: (input.requestPayload ?? undefined) as any,
        responseRaw: input.responseRaw ?? null,
        responseJson: (input.responsePayload ?? undefined) as any,
        errorMessage: input.errors?.join("; ") ?? null,
        createdByAdminId: input.createdByAdminId ?? null
      } });
    }
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
  return null;
}

export async function listDistributionLogsByRelease(releaseId: number): Promise<DistributionLog[]> {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) return (await prisma.direNoteLog.findMany({ where: { releaseId }, orderBy: { createdAt: "desc" } })) as any;
    return memory.distributionLogs.filter((log) => log.releaseId === releaseId);
  }
  return [];
}

export async function createReleaseAuditLog(input: { releaseId: number; userId?: number | null; action: string; details?: unknown }) {
  if (isPostgresPrisma()) {
    const row = await prisma.auditLog.create({ data: { actorId: input.userId ?? null, action: input.action, entity: "release", entityId: String(input.releaseId), metadata: { details: (input.details ?? null) as any } } });
    return { id: row.id, releaseId: input.releaseId, userId: row.actorId, action: row.action, details: input.details, createdAt: row.createdAt.toISOString() };
  }
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
  return null;
}

export async function listReleaseAuditLogs(releaseId: number): Promise<ReleaseAuditLog[]> {
  if (isPostgresPrisma()) {
    const rows = await prisma.auditLog.findMany({ where: { entity: "release", entityId: String(releaseId) }, orderBy: { createdAt: "desc" }, take: 250 });
    return rows.map(row => ({ id: row.id, releaseId, userId: row.actorId, action: row.action, details: row.metadata, createdAt: row.createdAt.toISOString() }));
  }
  const pool = getPool();
  if (!pool) return memory.auditLogs.filter((log) => log.releaseId === releaseId);
  return [];
}

export async function markReleaseDistributionSuccess(input: {
  releaseId: number;
  status: ReleaseStatus;
  distributorReleaseId?: string | null;
  upc?: string | null;
  trackIsrcs?: Array<{ trackNumber?: number; trackTitle?: string; isrc?: string | null; distributorStatus?: string | null }>;
  responsePayload?: unknown;
  warnings?: string[];
}) {
  const pool = getPool();
  if (!pool) {
    if (isPostgresPrisma()) {
      const release = await prisma.release.findUnique({ where: { id: input.releaseId }, select: { metadata: true, tracks: { orderBy: { trackNumber: "asc" } } } });
      if (!release) return null;
      
      const newMetadata = { ...(typeof release.metadata === "object" && release.metadata !== null ? release.metadata : {}) } as any;
      if (input.distributorReleaseId) newMetadata.distributorReleaseId = input.distributorReleaseId;
      if (input.upc) newMetadata.upcCode = input.upc;
      newMetadata.distributedAt = new Date().toISOString();
      newMetadata.direnoteAccepted = true;
      newMetadata.direnoteAcceptedAt = new Date().toISOString();
      newMetadata.direnoteSubmittedAt = newMetadata.direnoteSubmittedAt ?? new Date().toISOString();
      newMetadata.direnoteStatus = "accepted";
      newMetadata.direnoteResponse = input.responsePayload ?? null;
      newMetadata.direnoteWarnings = input.warnings ?? [];
      newMetadata.direnoteReleaseDate = (input.responsePayload as any)?.release_date ?? null;
      newMetadata.latestStatusSyncAt = new Date().toISOString();

      await updateDetailedReleaseStatus(input.releaseId, input.status, "DireNote accepted the release submission.");
      await prisma.release.update({
        where: { id: input.releaseId },
        data: {
          distributorReleaseId: input.distributorReleaseId || undefined,
          upc: input.upc || undefined,
          metadata: newMetadata
        },
        select: { id: true }
      });

      for (const isrc of input.trackIsrcs ?? []) {
        const track = release.tracks.find(t => t.trackNumber === isrc.trackNumber || t.title === isrc.trackTitle);
        if (track) {
          const trackMeta = { ...(typeof track.metadata === "object" && track.metadata !== null ? track.metadata : {}) } as any;
          if (isrc.isrc) trackMeta.isrc = isrc.isrc;
          if (isrc.distributorStatus) trackMeta.distributorStatus = isrc.distributorStatus;
          
          await prisma.track.update({
            where: { id: track.id },
            data: { isrc: isrc.isrc || undefined, distributorStatus: isrc.distributorStatus || undefined, metadata: trackMeta }
          });
        }
      }
      const updatedRelease = await getDetailedReleaseById(input.releaseId);
      if (updatedRelease) await notifyReleaseStatusChange(updatedRelease, input.status);
      return updatedRelease;
    }
    
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
    await notifyReleaseStatusChange(release, input.status);
    return release;
  }
  return null;
}

// vercel trigger

// vercel trigger 2
// vercel trigger 4
// vercel trigger 6
// vercel trigger 7
// vercel trigger 8
// vercel trigger 9
