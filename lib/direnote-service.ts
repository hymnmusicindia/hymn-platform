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
import { direNoteCorrectionFingerprint, extractDireNoteCorrections, matchDireNoteTrack, providerRequiresCorrections } from "@/lib/direnote-corrections";
import { normalizeDireNoteUpc, upcFromDireNoteIsrcReport } from "@/lib/direnote-upc";

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
  if (providerRequiresCorrections(status)) return "changes_required";
  if (/schedul|approved|accepted|ready/.test(status)) return "scheduled";
  if (/deliver|distribut/.test(status)) return "delivered";
  if (/pending|process|review|queue|ingest/.test(status)) return "processing";
  return status || "unknown";
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
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { tracks: { orderBy: { trackNumber: "asc" } } } });
  if (!release) throw new Error("Release not found.");
  let lookupUpc = normalizeDireNoteUpc(release.upc);
  if (!lookupUpc) {
    const isrc = release.tracks.map(track => normalized(track.isrc ?? "")).find(value => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value));
    if (!isrc) throw new Error("Awaiting DireNote identifiers: no numeric UPC or assigned track ISRC is available yet.");
    await reserveDireNoteRequest("upc_lookup", releaseId, actorId);
    // Identifier discovery only. Never import this report into the royalty ledger.
    const report = await getDireNoteRevenueReport(isrc);
    lookupUpc = report.success ? upcFromDireNoteIsrcReport(report.data, isrc, release.title) : null;
    const lookupError = lookupUpc ? null : report.success
      ? "Awaiting UPC: DireNote has not returned a numeric UPC for this ISRC and release title."
      : `DireNote UPC lookup failed (HTTP ${report.httpStatus ?? "unavailable"}). Check provider credentials or retry later.`;
    await prisma.direNoteLog.create({ data: {
      releaseId, action: "upc_lookup", httpStatus: report.httpStatus, success: Boolean(lookupUpc),
      requestPayloadRedacted: { isrc }, responseJson: { isrc, upc: lookupUpc },
      errorMessage: lookupError, createdByAdminId: actorId ?? null
    } });
    if (!lookupUpc) {
      await prisma.release.update({ where: { id: releaseId }, data: { direNoteLastAttemptedAt: new Date(), direNoteSyncError: lookupError } });
      throw new Error(lookupError!);
    }
  }
  await reserveDireNoteRequest("release_information", releaseId, actorId);
  await prisma.release.update({ where: { id: releaseId }, data: { direNoteLastAttemptedAt: new Date(), direNoteSyncError: null } });
  const result = await getDireNoteReleaseInformation(lookupUpc);
  const payload = record(result.data);
  const remoteRelease = record(payload.release);
  const remoteTracks = Array.isArray(payload.tracks) ? payload.tracks.map(record) : [];
  const providerCorrections = extractDireNoteCorrections(payload, release.tracks, releaseId);
  const lifecycleStatus = aggregateReleaseStatus(remoteTracks, remoteRelease.status ?? payload.status, release.releaseDate);
  const aggregateStatus = providerCorrections.length ? { provider: "changes_required", canonical: "changes_requested" as ReleaseStatus } : lifecycleStatus;
  const correctionMessages = providerCorrections.map(issue => `${issue.label}: ${issue.note}`);
  const correctionFingerprint = direNoteCorrectionFingerprint(providerCorrections);
  const previousDireNote = record(record(release.metadata).direNote);
  const safe = redactDireNoteDiagnostic(payload) as RecordValue;
  await prisma.direNoteLog.create({ data: { releaseId, action: "release_information", httpStatus: result.httpStatus, success: result.success, responseJson: safe as never, errorMessage: result.error ?? null, createdByAdminId: actorId ?? null } });
  if (!result.success) {
    const message = result.error || text(payload.message) || "DireNote release information lookup failed.";
    await prisma.release.update({ where: { id: releaseId }, data: { direNoteSyncError: message.slice(0, 1000) } });
    throw new Error(message);
  }
  if (!normalizeDireNoteUpc(release.upc)) {
    const confirmedUpc = normalizeDireNoteUpc(remoteRelease.upc_code);
    const matchingTrack = remoteTracks.some(remote => release.tracks.some(track => track.isrc && normalized(track.isrc) === normalized(text(remote.isrc))));
    if (confirmedUpc !== lookupUpc || !matchingTrack) {
      throw new Error("DireNote UPC recovery could not verify the release's UPC and track ISRC. No identifiers were changed.");
    }
  }

  await prisma.$transaction(async tx => {
    for (const track of release.tracks) {
      const external = remoteTracks.find(remote => matchDireNoteTrack(remote, release.tracks)?.id === track.id);
      if (!external) continue;
      const externalIsrc = text(external.isrc);
      if (externalIsrc && normalized(externalIsrc) !== normalized(track.isrc ?? "")) await tx.externalIdentifierHistory.create({ data: { releaseId, trackId: track.id, provider: "direnote", identifierType: "isrc", previousValue: track.isrc, canonicalValue: externalIsrc, source: "release_information_sync" } });
      await tx.track.update({ where: { id: track.id }, data: { isrc: externalIsrc || track.isrc, distributorStatus: mapDireNoteStatus(external.status), metadata: json({ ...(record(track.metadata)), direNote: { ...(record(record(track.metadata).direNote)), lastSyncedAt: new Date().toISOString(), external: redactDireNoteDiagnostic(external) } }) } });
      await persistArtistLinks(tx, releaseId, release.userId, external);
    }
    const remoteUpc = normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc!;
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
    await tx.release.update({ where: { id: releaseId }, data: { upc: remoteUpc, direNoteStatus: aggregateStatus.provider, direNoteLastSyncedAt: new Date(), direNoteSyncError: null, metadata: json({ ...(record(release.metadata)), direNote: { ...previousDireNote, lastSyncedAt: new Date().toISOString(), status: aggregateStatus.provider, release: redactDireNoteDiagnostic(remoteRelease), correctionMessages } }) } });
  });
  const previousStatus = release.status.toLowerCase() as ReleaseStatus;
  const customerWorkflow = ["changes_requested", "resubmitted", "under_review", "in_qc_queue", "in_queue", "submitted", "approved", "queued_for_distribution"].includes(previousStatus);
  const repeatCorrection = previousDireNote.appliedCorrectionFingerprint === correctionFingerprint;
  if (aggregateStatus.canonical && (aggregateStatus.canonical !== previousStatus || (aggregateStatus.canonical === "changes_requested" && !repeatCorrection))
    && !(aggregateStatus.canonical === "changes_requested" && repeatCorrection)
    && !(customerWorkflow && aggregateStatus.canonical !== "changes_requested")) {
    if (aggregateStatus.canonical === "changes_requested") {
      const reason = correctionMessages.join(" ") || "DireNote requires corrections before distribution can continue.";
      const review = {
        reason,
        issueType: "other" as const,
        severity: "required_correction" as const,
        fields: providerCorrections.length ? providerCorrections.map(({ field, label, note }) => ({ field, label, note })) : [{ field: "direnote.correction", label: "DireNote correction", note: reason }],
        adminInternalNote: "Automatically halted from DireNote release-information sync.",
        reviewedBy: "DireNote automation"
      };
      if (previousStatus === "changes_requested") {
        // Refresh changed reviewer instructions without sending another status notification.
        await prisma.release.updateMany({ where: { id: releaseId, status: "CHANGES_REQUESTED" }, data: { correctionReason: reason, reviewIssues: json({ type: review.issueType, severity: review.severity, fields: review.fields }) } });
      } else {
        await updateDetailedReleaseStatus(releaseId, "changes_requested", reason, review, { manualOverride: true, actorType: "system" });
      }
      await createAdminTaskOnce({ eventKey: `release:${releaseId}:direnote:correction`, type: "DireNote Correction", priority: "high", title: `DireNote correction required: ${release.title}`, body: reason, href: `/admin?tab=releases&releaseId=${releaseId}`, entityType: "release", entityId: releaseId });
      // Mark applied only after the correction workspace and task are persisted.
      await prisma.$transaction(async tx => {
        const current = await tx.release.findUniqueOrThrow({ where: { id: releaseId }, select: { metadata: true } });
        await tx.release.update({ where: { id: releaseId }, data: { metadata: json({ ...record(current.metadata), direNote: { ...record(record(current.metadata).direNote), appliedCorrectionFingerprint: correctionFingerprint } }) } });
      });
    } else {
      await updateDetailedReleaseStatus(releaseId, aggregateStatus.canonical, `DireNote status confirmed: ${aggregateStatus.provider}.`, undefined, { manualOverride: true, actorType: "system" });
      await resolveAdminTask(`release:${releaseId}:direnote:correction`, "DireNote no longer reports a correction requirement.");
    }
  }
  if (!customerWorkflow && aggregateStatus.canonical && aggregateStatus.canonical !== previousStatus && ["partially_live", "awaiting_live_confirmation"].includes(aggregateStatus.canonical)) {
    const copy = aggregateStatus.canonical === "partially_live"
        ? { title: `Release partially live: ${release.title}`, body: "DireNote has confirmed availability on at least one platform. Other stores may still be processing." }
        : { title: `Release awaiting live confirmation: ${release.title}`, body: "The release date has arrived and HYMN is verifying platform availability automatically." };
    try {
      await createNotification({ userId: release.userId, ...copy, type: "release", href: `/dashboard/releases?releaseId=${releaseId}&tab=distribution`, actionLabel: "View release", eventKey: `release:${releaseId}:direnote:${aggregateStatus.provider}`, metadata: { releaseId, status: aggregateStatus.provider, source: "direnote" } });
    } catch (error) {
      console.error("[DireNote] Status notification failed after sync", { releaseId, status: aggregateStatus.provider, message: error instanceof Error ? error.message : "Notification persistence failed." });
    }
  }
  return { success: true, releaseId, upc: normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc, status: aggregateStatus.provider, trackCount: remoteTracks.length };
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
