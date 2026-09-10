import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getDireNoteReleaseInformation, getDireNoteReleaseInformationByReference, getDireNoteRevenueReport, redactDireNoteDiagnostic } from "@/lib/direnote";
import { importDireNoteRevenueReport } from "@/lib/direnote-revenue";
import { reserveDireNoteRequest } from "@/lib/direnote-rate-limit";
import { createNotification } from "@/lib/db";
import { updateDetailedReleaseStatus } from "@/lib/distribution-db";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";
import { releaseDateReached } from "@/lib/release-status-engine";
import type { ReleaseStatus } from "@/lib/types";
import { direNoteCorrectionFingerprint, extractDireNoteCorrections, matchDireNoteTrack, providerRequiresCorrections } from "@/lib/direnote-corrections";
import { normalizeDireNoteUpc, upcFromDireNoteIsrcReport, upcFromDireNoteResponse } from "@/lib/direnote-upc";
import { currentDireNoteAttempt } from "@/lib/distribution-idempotency";
import { attachedArtistProfileIds, verifiedArtistStoreLinks } from "@/lib/artist-store-links";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue { return value && typeof value === "object" ? value as RecordValue : {}; }
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function normalized(value: string) { return value.replace(/[\s-]+/g, "").toUpperCase(); }
function json(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

async function persistArtistLinks(tx: Prisma.TransactionClient, releaseId: number, userId: number, external: RecordValue, trackMetadata: unknown, releaseArtistProfileId: number | null) {
  const artist = record(external.artist);
  const name = text(artist.name);
  const links = verifiedArtistStoreLinks(artist.links);
  if (!name || !Object.keys(links).length) return;
  const ids = attachedArtistProfileIds(trackMetadata, releaseArtistProfileId);
  if (!ids.length) return;
  const candidates = await tx.artistCard.findMany({ where: { id: { in: ids }, userId, archivedAt: null } });
  const matches = candidates.filter(card => card.artistName.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
  if (matches.length !== 1) return;
  const card = matches[0];
  const values = [
    ["spotify", card.spotifyProfileUrl, links.spotify?.url, "spotifyProfileUrl", "spotifyArtistId", links.spotify?.id],
    ["apple", card.appleMusicProfileUrl, links.apple?.url, "appleMusicProfileUrl", "appleArtistId", links.apple?.id],
    ["youtube", card.youtubeUrl, links.youtube?.url, "youtubeUrl", null, null]
  ] as const;
  for (const [provider, current, received, field, idField, providerId] of values) {
    if (!received) continue;
    const currentVerified = verifiedArtistStoreLinks({ [provider]: current })[provider];
    if (!current || current === received || (providerId && currentVerified?.id === providerId)) {
      // Compare-and-set prevents concurrent releases or a user edit from replacing a link.
      await tx.artistCard.updateMany({ where: { id: card.id, [field]: current }, data: { [field]: received, ...(idField && providerId ? { [idField]: providerId } : {}), direNoteLastSyncedAt: new Date() } });
    } else {
      const fieldName = `artist_${card.id}_link_${provider}`;
      const discrepancy = await tx.direNoteReconciliationDiscrepancy.findFirst({ where: { releaseId, field: fieldName, status: "open" } });
      if (!discrepancy) await tx.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field: fieldName, hymnValue: current, direNoteValue: received, severity: "warning" } });
    }
  }
}

export function mapDireNoteStatus(value: unknown) {
  const status = text(value).toLowerCase();
  if (status === "live") return "live";
  if (providerRequiresCorrections(status)) return "changes_required";
  if (/^(scheduled|approved|accepted|ready|ready for distribution)$/.test(status)) return "scheduled";
  if (/deliver|distribut/.test(status)) return "delivered";
  if (/pending|process|review|queue|ingest/.test(status)) return "processing";
  return "unknown";
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
  return prisma.$transaction(async lock => {
    const rows = await lock.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422028, ${releaseId}::integer) AS locked`;
    if (!rows[0]?.locked) throw new Error("DireNote release is already being synchronized or submitted.");
    return syncCurrentDireNoteRelease(releaseId, actorId);
  }, { timeout: 180_000, maxWait: 5000 });
}

async function syncCurrentDireNoteRelease(releaseId: number, actorId?: number | null) {
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { tracks: { orderBy: { trackNumber: "asc" } } } });
  if (!release) throw new Error("Release not found.");
  const attempt = await currentDireNoteAttempt(releaseId);
  const isTransfer = Boolean(record(release.metadata).releasePreviouslyReleased ?? record(release.metadata).previouslyReleased);
  const attemptTracks = Array.isArray(attempt.trackIdentifiers) ? attempt.trackIdentifiers.map(record) : [];
  const mappingTracks = release.tracks.map(track => {
    const snapshot = attemptTracks.find(item => item.id === track.id);
    return { ...track, isrc: snapshot ? text(snapshot.isrc) || null : track.isrc, providerTrackId: text(snapshot?.providerTrackId) || null };
  });
  let lookupUpc = normalizeDireNoteUpc(attempt.upc);
  let result: Awaited<ReturnType<typeof getDireNoteReleaseInformation>> | null = null;
  if (!lookupUpc) {
    const isrc = mappingTracks.map(track => normalized(track.isrc ?? "")).find(value => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value));
    if (!isrc) throw new Error("Awaiting DireNote identifiers: no numeric UPC or assigned track ISRC is available yet.");
    await reserveDireNoteRequest("upc_lookup", releaseId, actorId);
    // Identifier discovery only. Never import this report into the royalty ledger.
    const report = await getDireNoteRevenueReport(isrc);
    lookupUpc = report.success ? upcFromDireNoteIsrcReport(report.data, isrc, release.title) : null;
    const lookupError = lookupUpc ? null : report.success
      ? "Awaiting UPC: DireNote has not returned a numeric UPC for this ISRC and release title."
      : report.httpStatus === 401 ? "DIRENOTE_STATUS_AUTH_FAILED (HTTP 401): Identifier discovery authentication failed." : `DireNote UPC lookup failed (HTTP ${report.httpStatus ?? "unavailable"}). Check provider credentials or retry later.`;
    await prisma.direNoteLog.create({ data: {
      releaseId, action: "upc_lookup", httpStatus: report.httpStatus, success: Boolean(lookupUpc),
      requestPayloadRedacted: { isrc }, responseJson: { isrc, upc: lookupUpc },
      errorMessage: lookupError, createdByAdminId: actorId ?? null
    } });
    if (!lookupUpc && attempt.providerReference) {
      const providerReference = text(attempt.providerReference);
      for (const key of ["release_id", "distributor_release_id"] as const) {
        await reserveDireNoteRequest(`release_information_${key}`, releaseId, actorId);
        const referenceResult = await getDireNoteReleaseInformationByReference(providerReference, key, { timeoutMs: 20_000 });
        const referenceUpc = referenceResult.success ? upcFromDireNoteResponse(referenceResult.data) : null;
        await prisma.direNoteLog.create({ data: {
          releaseId, action: `release_information_${key}`, httpStatus: referenceResult.httpStatus, success: Boolean(referenceUpc),
          requestPayloadRedacted: { [key]: providerReference, attemptId: attempt.id }, responseJson: redactDireNoteDiagnostic(referenceResult.data) as never,
          errorMessage: referenceUpc ? null : referenceResult.error ?? "DireNote did not return a numeric UPC for this release reference.", createdByAdminId: actorId ?? null
        } });
        if (referenceUpc) {
          lookupUpc = referenceUpc;
          result = referenceResult;
          break;
        }
      }
    }
    if (!lookupUpc) {
      await prisma.release.update({ where: { id: releaseId }, data: { direNoteLastAttemptedAt: new Date(), direNoteSyncError: lookupError } });
      throw new Error(lookupError!);
    }
  }
  await reserveDireNoteRequest("release_information", releaseId, actorId);
  await prisma.release.update({ where: { id: releaseId }, data: { direNoteLastAttemptedAt: new Date(), direNoteSyncError: null } });
  result ??= await getDireNoteReleaseInformation(lookupUpc, { timeoutMs: 20_000 });
  for (let retry = 0; !result.success && retry < 2 && (result.httpStatus === null || result.httpStatus >= 500); retry++) {
    await new Promise(resolve => setTimeout(resolve, 500 * 2 ** retry));
    await reserveDireNoteRequest("release_information_retry", releaseId, actorId);
    result = await getDireNoteReleaseInformation(lookupUpc, { timeoutMs: 20_000 });
  }
  if (result.httpStatus === 429) {
    await prisma.direNoteLog.create({ data: { releaseId, action: "provider_rate_limit", success: false, httpStatus: 429, responseJson: { retryAt: new Date(Date.now() + Math.max(60, result.retryAfterSeconds ?? 3600) * 1000).toISOString() } } });
  }
  const payload = record(result.data);
  const remoteRelease = record(payload.release);
  const remoteTracks: Record<string, unknown>[] = (Array.isArray(payload.tracks) ? payload.tracks.map(record) : Array.isArray(remoteRelease.tracks) ? remoteRelease.tracks.map(record) : []).map((track, index) => ({ ...track, track_number: track.track_number ?? index + 1 }));
  const providerCorrections = extractDireNoteCorrections(redactDireNoteDiagnostic(payload) as RecordValue, mappingTracks, releaseId, attempt.id);
  const lifecycleStatus = aggregateReleaseStatus(remoteTracks, remoteRelease.status ?? payload.status, release.releaseDate);
  const aggregateStatus = providerCorrections.length ? { provider: "changes_required", canonical: "changes_requested" as ReleaseStatus } : lifecycleStatus;
  const correctionMessages = providerCorrections.map(issue => `${issue.label}: ${issue.note}`);
  const correctionFingerprint = direNoteCorrectionFingerprint(providerCorrections);
  const previousDireNote = record(record(release.metadata).direNote);
  const safe = redactDireNoteDiagnostic(payload) as RecordValue;
  await prisma.direNoteLog.create({ data: { releaseId, action: "release_information", httpStatus: result.httpStatus, success: result.success, requestPayloadRedacted: { upc: lookupUpc, attemptId: attempt.id }, responseJson: safe as never, errorMessage: result.httpStatus === 401 ? "DIRENOTE_STATUS_AUTH_FAILED" : result.error ?? null, createdByAdminId: actorId ?? null } });
  if (!result.success) {
    const message = result.httpStatus === 401 ? "DIRENOTE_STATUS_AUTH_FAILED: Verify server-side DireNote credentials." : String(redactDireNoteDiagnostic(result.error || "DireNote release information lookup failed."));
    await prisma.release.update({ where: { id: releaseId }, data: { direNoteSyncError: message.slice(0, 1000) } });
    if (result.httpStatus === 401) await createAdminTaskOnce({ eventKey: "direnote:status:auth-failed", type: "DireNote Failed", priority: "critical", title: "DireNote status authentication failed", body: message, href: "/admin?tab=releases", entityType: "release", entityId: releaseId });
    throw new Error(message);
  }
  if (lifecycleStatus.provider === "unknown" && !providerCorrections.length) {
    const message = "DIRENOTE_MALFORMED_RESPONSE: No release or track status returned.";
    await prisma.release.update({ where: { id: releaseId }, data: { direNoteSyncError: message } });
    throw new Error(message);
  }
  if (normalizeDireNoteUpc(remoteRelease.upc_code) && normalizeDireNoteUpc(remoteRelease.upc_code) !== lookupUpc) throw new Error("DireNote returned a different UPC from the current lookup. No release identifiers were changed.");
  if (!normalizeDireNoteUpc(attempt.upc)) {
    const confirmedUpc = normalizeDireNoteUpc(remoteRelease.upc_code);
    const matchingTrack = remoteTracks.some(remote => release.tracks.some(track => track.isrc && normalized(track.isrc) === normalized(text(remote.isrc))));
    if (confirmedUpc !== lookupUpc || !matchingTrack) {
      throw new Error("DireNote UPC recovery could not verify the release's UPC and track ISRC. No identifiers were changed.");
    }
  }

  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422027, ${releaseId}::integer)`;
    const stillCurrent = await tx.distributionSubmissionAttempt.findFirst({ where: { id: attempt.id, isCurrent: true } });
    if (!stillCurrent) throw new Error("DireNote attempt was superseded during status lookup. Retry the current attempt.");
    await tx.distributionSubmissionAttempt.update({ where: { id: attempt.id }, data: {
      lastCheckedAt: new Date(), providerStatus: aggregateStatus.provider, rawStatusPayload: safe as never,
      upc: normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc,
      trackIdentifiers: mappingTracks.map(track => {
        const remote = remoteTracks.find(item => matchDireNoteTrack(item, mappingTracks)?.id === track.id);
        return { id: track.id, title: track.title, trackNumber: track.trackNumber, isrc: isTransfer && track.isrc ? track.isrc : text(remote?.isrc) || track.isrc, providerTrackId: text(remote?.track_id ?? remote?.id) || track.providerTrackId };
      })
    } });
    for (const track of release.tracks) {
      const external = remoteTracks.find(remote => matchDireNoteTrack(remote, mappingTracks)?.id === track.id);
      if (!external) continue;
      const externalIsrc = isTransfer && track.isrc ? track.isrc : text(external.isrc);
      if (externalIsrc && normalized(externalIsrc) !== normalized(track.isrc ?? "")) await tx.externalIdentifierHistory.create({ data: { releaseId, trackId: track.id, provider: "direnote", identifierType: "isrc", previousValue: track.isrc, canonicalValue: externalIsrc, source: "release_information_sync" } });
      await tx.track.update({ where: { id: track.id }, data: { isrc: externalIsrc || track.isrc, distributorStatus: mapDireNoteStatus(external.status), metadata: json({ ...(record(track.metadata)), direNote: { ...(record(record(track.metadata).direNote)), lastSyncedAt: new Date().toISOString(), external: redactDireNoteDiagnostic(external) } }) } });
      await persistArtistLinks(tx, releaseId, release.userId, external, track.metadata, release.artistProfileId);
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
  const providerAccepted = ["scheduled", "awaiting_live_confirmation", "partially_live", "live"].includes(aggregateStatus.provider);
  const customerWorkflow = !providerAccepted && ["changes_requested", "resubmitted", "under_review", "in_qc_queue", "in_queue", "submitted", "approved", "queued_for_distribution"].includes(previousStatus);
  const repeatCorrection = previousDireNote.appliedCorrectionFingerprint === correctionFingerprint;
  if (aggregateStatus.canonical && (aggregateStatus.canonical !== previousStatus || (aggregateStatus.canonical === "changes_requested" && !repeatCorrection))
    && !(aggregateStatus.canonical === "changes_requested" && repeatCorrection)
    && !(customerWorkflow && aggregateStatus.canonical !== "changes_requested")) {
    if (aggregateStatus.canonical === "changes_requested") {
      const reason = correctionMessages.join(" ") || "DireNote requires corrections before distribution can continue.";
      const review = {
        reason,
        issueType: providerCorrections.some(issue => issue.field === "rights.contentId") ? "rights_ownership" as const : "other" as const,
        severity: "required_correction" as const,
        fields: providerCorrections.length ? providerCorrections.map(({ field, label, note }) => ({ field, label, note })) : [{ field: "direnote.correction", label: "DireNote correction", note: reason }],
        adminInternalNote: "Automatically halted from DireNote release-information sync.",
        reviewedBy: "DireNote automation"
      };
      await updateDetailedReleaseStatus(releaseId, "changes_requested", reason, review, {
        manualOverride: true, actorType: "system", notify: true, reviewChanged: record(attempt.corrections).fingerprint !== correctionFingerprint,
        persist: async tx => {
          if (record(attempt.corrections).fingerprint === correctionFingerprint) return;
          const currentRelease = await tx.release.findUniqueOrThrow({ where: { id: releaseId }, select: { metadata: true } });
          await tx.release.update({ where: { id: releaseId }, data: { metadata: json({ ...record(currentRelease.metadata), direNote: { ...record(record(currentRelease.metadata).direNote), correctionEventKey: correctionFingerprint } }) } });
          await tx.distributionSubmissionAttempt.update({ where: { id: attempt.id }, data: { corrections: json({
            ...record(attempt.corrections), status: "customer_action_required", fingerprint: correctionFingerprint,
            detectedAt: new Date().toISOString(), fields: providerCorrections,
            history: [...(Array.isArray(record(attempt.corrections).history) ? record(attempt.corrections).history as unknown[] : []), { detectedAt: new Date().toISOString(), fields: providerCorrections }]
          }) } });
        }
      });
      await createAdminTaskOnce({ eventKey: `release:${releaseId}:direnote:correction:${attempt.id}:${correctionFingerprint}`, type: "DireNote Correction", priority: "high", title: `DireNote correction required: ${release.title}`, body: reason, href: `/admin?tab=releases&releaseId=${releaseId}`, entityType: "release", entityId: releaseId });
      // Mark applied only after the correction workspace and task are persisted.
      await prisma.$transaction(async tx => {
        const current = await tx.release.findUniqueOrThrow({ where: { id: releaseId }, select: { metadata: true } });
        await tx.release.update({ where: { id: releaseId }, data: { metadata: json({ ...record(current.metadata), direNote: { ...record(record(current.metadata).direNote), appliedCorrectionFingerprint: correctionFingerprint } }) } });
      });
    } else {
      await updateDetailedReleaseStatus(releaseId, aggregateStatus.canonical, `DireNote status confirmed: ${aggregateStatus.provider}.`, undefined, { manualOverride: true, actorType: "system" });
      if (providerAccepted) {
        await prisma.distributionSubmissionAttempt.update({ where: { id: attempt.id }, data: { corrections: json({ ...record(attempt.corrections), status: "closed", providerClearedAt: new Date().toISOString() }) } });
      }
      await resolveAdminTask(`release:${releaseId}:direnote:correction:${attempt.id}:${record(attempt.corrections).fingerprint}`, "DireNote no longer reports a correction requirement.");
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
