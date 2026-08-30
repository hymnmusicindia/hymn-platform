import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getDireNoteReleaseInformation, getDireNoteRevenueReport, redactDireNoteDiagnostic } from "@/lib/direnote";
import { importDireNoteRevenueReport } from "@/lib/direnote-revenue";
import { reserveDireNoteRequest } from "@/lib/direnote-rate-limit";
import { createNotification } from "@/lib/db";
import { updateDetailedReleaseStatus } from "@/lib/distribution-db";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";
import { releaseDateReached } from "@/lib/release-status-engine";
import type { ReleaseStatus } from "@/lib/types";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue { return value && typeof value === "object" ? value as RecordValue : {}; }
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function normalized(value: string) { return value.replace(/[\s-]+/g, "").toUpperCase(); }
function json(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

async function persistArtistLinks(tx: Prisma.TransactionClient, releaseId: number, userId: number, external: RecordValue) {
  const artist = record(external.artist);
  const name = text(artist.name);
  const links = record(artist.links);
  if (!name || !Object.keys(links).length) return;
  const card = await tx.artistCard.findFirst({ where: { userId, artistName: name, archivedAt: null } });
  if (!card) return;
  const values = [
    ["spotify", card.spotifyProfileUrl, text(links.spotify), "spotifyProfileUrl"],
    ["apple", card.appleMusicProfileUrl, text(links.apple), "appleMusicProfileUrl"],
    ["youtube", card.youtubeUrl, text(links.youtube), "youtubeUrl"]
  ] as const;
  const updates: Record<string, unknown> = { direNoteLastSyncedAt: new Date() };
  for (const [provider, current, received, field] of values) {
    if (!received) continue;
    if (!current) updates[field] = received;
    else if (current !== received) {
      const discrepancy = await tx.direNoteReconciliationDiscrepancy.findFirst({ where: { releaseId, field: `artist_link_${provider}`, status: "open" } });
      if (!discrepancy) await tx.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field: `artist_link_${provider}`, hymnValue: current, direNoteValue: received, severity: "warning" } });
    }
  }
  await tx.artistCard.update({ where: { id: card.id }, data: updates });
}

export function mapDireNoteStatus(value: unknown) {
  const status = text(value).toLowerCase();
  if (status === "live") return "live";
  if (/reject|denied|declin|correction|changes?\s*required|action\s*required|fix\s*required|failed|error|invalid|blocked/.test(status)) return "changes_required";
  if (/schedul|approved|accepted|ready/.test(status)) return "scheduled";
  if (/deliver|distribut/.test(status)) return "delivered";
  if (/pending|process|review|queue|ingest/.test(status)) return "processing";
  return status || "unknown";
}

function providerCorrectionMessages(payload: RecordValue, tracks: RecordValue[]) {
  const messages = new Set<string>();
  const add = (value: unknown) => {
    const message = text(value).replace(/\s+/g, " ").trim();
    if (message && message.length > 2 && !/^(false|true|failed|rejected|denied)$/i.test(message)) messages.add(message.slice(0, 500));
  };
  const inspect = (value: unknown, depth = 0) => {
    if (depth > 3 || value == null) return;
    if (Array.isArray(value)) return value.slice(0, 20).forEach((item) => inspect(item, depth + 1));
    if (typeof value !== "object") return;
    for (const [key, item] of Object.entries(value as RecordValue)) {
      if (/message|error|reason|correction|issue|remark|note|action/i.test(key)) {
        if (typeof item === "string" || typeof item === "number") add(item);
        else inspect(item, depth + 1);
      }
    }
  };
  inspect(payload);
  tracks.filter((track) => mapDireNoteStatus(track.status) === "changes_required").forEach((track) => inspect(track));
  return [...messages].slice(0, 10);
}

function aggregateReleaseStatus(tracks: RecordValue[], releaseStatus: unknown, releaseDate: Date) {
  const statuses = [mapDireNoteStatus(releaseStatus), ...tracks.map((track) => mapDireNoteStatus(track.status))].filter((status) => status !== "unknown");
  if (!statuses.length) return { provider: "unknown", canonical: null } as const;
  if (statuses.some((status) => status === "changes_required")) return { provider: "changes_required", canonical: "changes_requested" as ReleaseStatus } as const;
  const trackStatuses = tracks.map((track) => mapDireNoteStatus(track.status));
  if (trackStatuses.length && trackStatuses.every((status) => status === "live")) return { provider: "live", canonical: "live" as ReleaseStatus } as const;
  if (statuses.some((status) => status === "live")) return { provider: "partially_live", canonical: "partially_live" as ReleaseStatus } as const;
  if (statuses.some((status) => status === "scheduled" || status === "delivered")) {
    return releaseDateReached(releaseDate.toISOString())
      ? { provider: "awaiting_live_confirmation", canonical: "awaiting_live_confirmation" as ReleaseStatus } as const
      : { provider: "scheduled", canonical: "scheduled" as ReleaseStatus } as const;
  }
  return { provider: "processing", canonical: "distributor_processing" as ReleaseStatus } as const;
}

/** Fetches the documented UPC lookup and caches provider facts without overwriting HYMN metadata. */
export async function syncDireNoteRelease(releaseId: number, actorId?: number | null) {
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { tracks: true } });
  if (!release) throw new Error("Release not found.");
  if (!release.upc) throw new Error("A UPC is required before DireNote can sync this release.");
  await reserveDireNoteRequest("release_information", releaseId, actorId);
  await prisma.release.update({ where: { id: releaseId }, data: { direNoteLastAttemptedAt: new Date(), direNoteSyncError: null } });
  const result = await getDireNoteReleaseInformation(release.upc);
  const payload = record(result.data);
  const remoteRelease = record(payload.release);
  const remoteTracks = Array.isArray(payload.tracks) ? payload.tracks.map(record) : [];
  const aggregateStatus = aggregateReleaseStatus(remoteTracks, remoteRelease.status ?? payload.status, release.releaseDate);
  const correctionMessages = aggregateStatus.provider === "changes_required" ? providerCorrectionMessages(payload, remoteTracks) : [];
  const safe = redactDireNoteDiagnostic(payload) as RecordValue;
  await prisma.direNoteLog.create({ data: { releaseId, action: "release_information", httpStatus: result.httpStatus, success: result.success, responseJson: safe as never, errorMessage: result.error ?? null, createdByAdminId: actorId ?? null } });
  if (!result.success) {
    const message = result.error || text(payload.message) || "DireNote release information lookup failed.";
    await prisma.release.update({ where: { id: releaseId }, data: { direNoteSyncError: message.slice(0, 1000) } });
    throw new Error(message);
  }

  const byIsrc = new Map(remoteTracks.map((track) => [normalized(text(track.isrc)), track]));
  const byTitle = new Map(remoteTracks.map((track) => [text(track.track_name).toLowerCase(), track]));
  await prisma.$transaction(async tx => {
    for (const track of release.tracks) {
      const external = byIsrc.get(normalized(track.isrc ?? "")) ?? byTitle.get(track.title.toLowerCase());
      if (!external) continue;
      const externalIsrc = text(external.isrc);
      if (externalIsrc && normalized(externalIsrc) !== normalized(track.isrc ?? "")) await tx.externalIdentifierHistory.create({ data: { releaseId, trackId: track.id, provider: "direnote", identifierType: "isrc", previousValue: track.isrc, canonicalValue: externalIsrc, source: "release_information_sync" } });
      await tx.track.update({ where: { id: track.id }, data: { isrc: externalIsrc || track.isrc, distributorStatus: mapDireNoteStatus(external.status), metadata: json({ ...(record(track.metadata)), direNote: { ...(record(record(track.metadata).direNote)), lastSyncedAt: new Date().toISOString(), external: redactDireNoteDiagnostic(external) } }) } });
      await persistArtistLinks(tx, releaseId, release.userId, external);
    }
    const remoteUpc = text(remoteRelease.upc_code) || release.upc || "";
    const comparisons = [
      { field: "upc", hymn: release.upc, external: remoteUpc, severity: "critical" },
      { field: "release_title", hymn: release.title, external: text(remoteRelease.album_name), severity: "warning" },
      { field: "track_count", hymn: String(release.tracks.length), external: String(remoteTracks.length), severity: "warning" }
    ].filter(item => item.external && normalized(item.hymn ?? "") !== normalized(item.external));
    for (const comparison of comparisons) {
      const existing = await tx.direNoteReconciliationDiscrepancy.findFirst({ where: { releaseId, field: comparison.field, status: "open" } });
      if (!existing) await tx.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field: comparison.field, hymnValue: comparison.hymn ?? Prisma.JsonNull, direNoteValue: comparison.external ?? Prisma.JsonNull, severity: comparison.severity } });
    }
    if (remoteUpc !== release.upc) await tx.externalIdentifierHistory.create({ data: { releaseId, provider: "direnote", identifierType: "upc", previousValue: release.upc, canonicalValue: remoteUpc, source: "release_information_sync" } });
    await tx.release.update({ where: { id: releaseId }, data: { upc: remoteUpc, direNoteStatus: aggregateStatus.provider, direNoteLastSyncedAt: new Date(), direNoteSyncError: null, metadata: json({ ...(record(release.metadata)), direNote: { lastSyncedAt: new Date().toISOString(), status: aggregateStatus.provider, release: redactDireNoteDiagnostic(remoteRelease), correctionMessages } }) } });
  });
  const previousStatus = release.status.toLowerCase() as ReleaseStatus;
  if (aggregateStatus.canonical && aggregateStatus.canonical !== previousStatus) {
    if (aggregateStatus.canonical === "changes_requested") {
      const reason = correctionMessages.join(" ") || "DireNote requires corrections before distribution can continue.";
      await updateDetailedReleaseStatus(releaseId, "changes_requested", reason, {
        reason,
        issueType: "other",
        severity: "required_correction",
        fields: (correctionMessages.length ? correctionMessages : [reason]).map((message, index) => ({ field: `direnote.${index + 1}`, label: `DireNote correction ${index + 1}`, note: message })),
        adminInternalNote: "Automatically halted from DireNote release-information sync.",
        reviewedBy: "DireNote automation"
      }, { manualOverride: true, actorType: "system" });
      await createAdminTaskOnce({ eventKey: `release:${releaseId}:direnote:correction`, type: "DireNote Correction", priority: "high", title: `DireNote correction required: ${release.title}`, body: reason, href: `/admin?tab=releases&releaseId=${releaseId}`, entityType: "release", entityId: releaseId });
    } else {
      await updateDetailedReleaseStatus(releaseId, aggregateStatus.canonical, `DireNote status confirmed: ${aggregateStatus.provider}.`, undefined, { manualOverride: true, actorType: "system" });
      await resolveAdminTask(`release:${releaseId}:direnote:correction`, "DireNote no longer reports a correction requirement.");
    }
  }
  if (aggregateStatus.canonical && aggregateStatus.canonical !== previousStatus && ["partially_live", "awaiting_live_confirmation"].includes(aggregateStatus.canonical)) {
    const copy = aggregateStatus.canonical === "partially_live"
        ? { title: `Release partially live: ${release.title}`, body: "DireNote has confirmed availability on at least one platform. Other stores may still be processing." }
        : { title: `Release awaiting live confirmation: ${release.title}`, body: "The release date has arrived and HYMN is verifying platform availability automatically." };
    try {
      await createNotification({ userId: release.userId, ...copy, type: "release", href: `/dashboard/releases?releaseId=${releaseId}&tab=distribution`, actionLabel: "View release", eventKey: `release:${releaseId}:direnote:${aggregateStatus.provider}`, metadata: { releaseId, status: aggregateStatus.provider, source: "direnote" } });
    } catch (error) {
      console.error("[DireNote] Status notification failed after sync", { releaseId, status: aggregateStatus.provider, message: error instanceof Error ? error.message : "Notification persistence failed." });
    }
  }
  return { success: true, releaseId, upc: text(remoteRelease.upc_code) || release.upc, status: aggregateStatus.provider, trackCount: remoteTracks.length };
}

/** Returns the documented ISRC report. Accounting ingestion remains explicit and admin-controlled. */
export async function getDireNoteTrackRevenue(isrc: string, actorId?: number | null, importIntoLedger = false) {
  const track = await prisma.track.findFirst({ where: { isrc: normalized(isrc) }, select: { releaseId: true } });
  await reserveDireNoteRequest("revenue_report", track?.releaseId ?? null, actorId);
  const result = await getDireNoteRevenueReport(isrc);
  const payload = record(result.data);
  await prisma.direNoteLog.create({ data: { releaseId: track?.releaseId ?? null, action: "revenue_report", httpStatus: result.httpStatus, success: result.success, requestPayloadRedacted: { isrc: normalized(isrc) }, responseJson: redactDireNoteDiagnostic(payload) as never, errorMessage: result.error ?? null, createdByAdminId: actorId ?? null } });
  if (!result.success) throw new Error(result.error || text(payload.message) || "DireNote revenue report lookup failed.");
  const ingestion = importIntoLedger && actorId ? await importDireNoteRevenueReport(payload, actorId) : null;
  return { report: payload, ingestion };
}
