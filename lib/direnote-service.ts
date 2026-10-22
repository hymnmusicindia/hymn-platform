import { completeArtistAmendment } from '@/lib/release-artist-amendment';
import { artistIdentityFingerprint, cardIdentity, conflictsWithHistoricalIdentity, selectedReleaseArtistIds, snapshotMatchesCard } from '@/lib/release-artist-verification';
import { prisma } from "@/lib/prisma";
import { refreshMissingSpotifyArtistPhotos, refreshSpotifyArtistPhoto } from "@/lib/spotify-artist-photos";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getDireNoteArtistInformation, getDireNoteReleaseInformation, getDireNoteReleaseInformationByReference, getDireNoteRevenueReport, getDireNoteSongwriterInformation, redactDireNoteDiagnostic } from "@/lib/direnote";
import { importDireNoteRevenueReport } from "@/lib/direnote-revenue";
import { reserveDireNoteRequest } from "@/lib/direnote-rate-limit";
import { createNotification } from "@/lib/db";
import { updateDetailedReleaseStatus } from "@/lib/distribution-db";
import { createAdminTaskOnce, resolveAdminTask } from "@/lib/task-queue";
import { releaseDateReached } from "@/lib/release-status-engine";
import type { ReleaseStatus } from "@/lib/types";
import { direNoteCorrectionFingerprint, extractDireNoteCorrections, matchDireNoteTrack, providerRequiresCorrections } from "@/lib/direnote-corrections";
import { normalizeDireNoteUpc, upcFromDireNoteIsrcReport, upcFromDireNoteResponse } from "@/lib/direnote-upc";
import { ensureCurrentDireNoteAttempt } from "@/lib/distribution-idempotency";
import { currentDireNoteTracks } from "@/lib/direnote-track-revisions";
import { attachedArtistProfileIds, verifiedArtistStoreLinks, savedArtistStoreLinks } from "@/lib/artist-store-links";
import { ensureDireNoteArtistMapping, flagArtistMappingReview } from "@/lib/direnote-artist-mapping";
import { validIsrc, validReleaseBarcode } from "@/lib/release-input-rules";
import { confirmsDireNoteWithdrawal } from "@/lib/direnote/v24-reconciliation";
import { fetchBoundReleaseQcReport } from "@/lib/direnote-qc-store";
import { qcMatchCorrectionNotes, providerQcSourceUpc } from "@/lib/direnote-qc-details";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { direNoteQcCorrectionPayload } from "@/lib/direnote-qc-report";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue { return value && typeof value === "object" ? value as RecordValue : {}; }
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function normalized(value: string) { return value.replace(/[\s-]+/g, "").toUpperCase(); }
function json(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }

function verifiedInstagram(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname) || !/^\/[A-Za-z0-9._]+\/?$/.test(url.pathname)) return null;
    return `https://www.instagram.com/${url.pathname.split("/").filter(Boolean)[0]}`;
  } catch { return null; }
}

function verifiedX(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) || !/^\/[A-Za-z0-9_]+\/?$/.test(url.pathname)) return null;
    return `https://x.com/${url.pathname.split("/").filter(Boolean)[0]}`;
  } catch { return null; }
}

/** Refreshes one locally associated artist from DireNote's v2.3 artist endpoint. */
export async function syncDireNoteArtistInformation(artistCardId: number, actorId?: number | null, releaseId?: number | null) {
  const card = await prisma.artistCard.findUnique({ where: { id: artistCardId } });
  if (!card?.direNoteArtistId || card.archivedAt) throw new Error("This artist does not have a stored DireNote artist ID.");
  await reserveDireNoteRequest("artist_information", releaseId ?? null, actorId);
  const result = await getDireNoteArtistInformation(card.direNoteArtistId);
  const payload = record(result.data);
  const artist = record(payload.artist);
  const remoteId = text(artist.artist_id);
  const remoteName = text(artist.name);
  await prisma.direNoteLog.create({ data: { releaseId: releaseId ?? null, action: "artist_information", httpStatus: result.httpStatus, success: result.success, requestPayloadRedacted: { artistId: card.direNoteArtistId }, responseJson: redactDireNoteDiagnostic(payload) as never, errorMessage: result.error ?? null, createdByAdminId: actorId ?? null } });
  if (!result.success) throw new Error(result.error || text(payload.message) || "DireNote artist lookup failed.");
  if (remoteId !== card.direNoteArtistId || !remoteName || remoteName.toLocaleLowerCase() !== card.artistName.trim().toLocaleLowerCase()) {
    throw new Error("DireNote returned an artist profile that does not match the attached HYMN artist.");
  }
  const links = verifiedArtistStoreLinks(artist.links);
  const instagram = verifiedInstagram(record(artist.links).instagram);
  if (releaseId) {
    const conflicts = [
      ["spotify", card.spotifyProfileUrl, links.spotify?.url], ["apple", card.appleMusicProfileUrl, links.apple?.url],
      ["youtube", card.youtubeUrl, links.youtube?.url], ["instagram", card.instagramUrl, instagram]
    ].filter((item): item is [string, string, string] => Boolean(item[1] && item[2] && item[1] !== item[2]));
    for (const [provider, hymnValue, direNoteValue] of conflicts) {
      const field = `artist_${card.id}_profile_${provider}`;
      const existing = await prisma.direNoteReconciliationDiscrepancy.findFirst({ where: { releaseId, field, status: "open" } });
      if (!existing) await prisma.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field, hymnValue, direNoteValue, severity: "warning" } });
    }
  }
  // Do not let a delayed provider response overwrite a link edited in the meantime.
  const updatedCard = await prisma.$transaction(async tx => {
    const identity = { id: card.id, archivedAt: null, direNoteArtistId: card.direNoteArtistId };
    const values = [
      ["spotifyProfileUrl", card.spotifyProfileUrl, links.spotify?.url, "spotifyArtistId", links.spotify?.id],
      ["appleMusicProfileUrl", card.appleMusicProfileUrl, links.apple?.url, "appleArtistId", links.apple?.id],
      ["youtubeUrl", card.youtubeUrl, links.youtube?.url, null, null],
      ["instagramUrl", card.instagramUrl, instagram, null, null]
    ] as const;
    for (const [field, current, received, idField, providerId] of values) {
      if (current || !received) continue;
      await tx.artistCard.updateMany({ where: { ...identity, [field]: current }, data: { [field]: received, ...(idField && providerId ? { [idField]: providerId } : {}) } });
    }
    await tx.artistCard.updateMany({ where: identity, data: { direNoteLastSyncedAt: new Date() } });
    return tx.artistCard.findUniqueOrThrow({ where: { id: card.id } });
  });
  if (!card.spotifyProfileUrl && updatedCard.spotifyProfileUrl) {
    try { await refreshSpotifyArtistPhoto(card.id); }
    catch { /* Daily Spotify refresh retries transient provider errors. */ }
  }
  const savedLinks = savedArtistStoreLinks(updatedCard);
  if ((['spotify', 'apple'] as const).some(provider => savedLinks[provider] && savedLinks[provider]?.id !== links[provider]?.id)) {
    try { await ensureDireNoteArtistMapping(updatedCard.id, releaseId ?? null, actorId); }
    catch (error) {
      await flagArtistMappingReview({ releaseId, artistCardId: card.id, name: card.artistName, message: error instanceof Error ? error.message : "Artist store identity needs review. Do not resubmit accepted releases." });
    }
  }
  return updatedCard;
}

/** Refreshes one canonical songwriter/composer identity from DireNote v2.3. */
export async function syncDireNoteSongwriterInformation(partyId: number, actorId?: number | null, releaseId?: number | null) {
  const party = await prisma.contributorParty.findUnique({ where: { id: partyId } });
  if (!party?.direNoteSongwriterId || party.mergedIntoId) throw new Error("This contributor does not have an active DireNote songwriter identity.");
  await reserveDireNoteRequest("songwriter_information", releaseId ?? null, actorId);
  const result = await getDireNoteSongwriterInformation(party.direNoteSongwriterId);
  const payload = record(result.data);
  const songwriter = record(payload.songwriter);
  const remoteId = text(songwriter.songwriter_id);
  const remoteName = text(songwriter.name);
  await prisma.direNoteLog.create({ data: { releaseId: releaseId ?? null, action: "songwriter_information", httpStatus: result.httpStatus, success: result.success, requestPayloadRedacted: { songwriterId: party.direNoteSongwriterId, partyId }, responseJson: redactDireNoteDiagnostic(payload) as never, errorMessage: result.error ?? null, createdByAdminId: actorId ?? null } });
  if (!result.success) throw new Error(result.error || text(payload.message) || "DireNote songwriter lookup failed.");
  const localNames = [party.legalName, party.professionalName, party.displayName].filter(Boolean).map(value => value!.trim().toLocaleLowerCase());
  if (remoteId !== party.direNoteSongwriterId || !remoteName || !localNames.includes(remoteName.toLocaleLowerCase())) throw new Error("DireNote returned a songwriter record that does not match the attached HYMN contributor.");
  const links = record(songwriter.links);
  const ipi = text(songwriter.ipi) || null;
  const iprsMember = ["Yes", "No"].includes(text(songwriter.iprs_member)) ? text(songwriter.iprs_member) : null;
  if (releaseId) {
    const conflicts = [["ipi", party.ipi, ipi], ["iprs_member", party.iprsMember, iprsMember], ["instagram", party.instagramUrl, verifiedInstagram(links.instagram)], ["x", party.xUrl, verifiedX(links.x)]]
      .filter((item): item is [string, string, string] => Boolean(item[1] && item[2] && item[1] !== item[2]));
    for (const [property, hymnValue, direNoteValue] of conflicts) {
      const field = `contributor_${party.id}_${property}`;
      const existing = await prisma.direNoteReconciliationDiscrepancy.findFirst({ where: { releaseId, field, status: "open" } });
      if (!existing) await prisma.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field, hymnValue, direNoteValue, severity: property === "ipi" ? "critical" : "warning" } });
    }
  }
  return prisma.contributorParty.update({ where: { id: party.id }, data: {
    direNoteLastSyncedAt: new Date(),
    ...(!party.ipi && ipi ? { ipi } : {}),
    ...(!party.iprsMember && iprsMember ? { iprsMember } : {}),
    ...(!party.instagramUrl && verifiedInstagram(links.instagram) ? { instagramUrl: verifiedInstagram(links.instagram) } : {}),
    ...(!party.xUrl && verifiedX(links.x) ? { xUrl: verifiedX(links.x) } : {})
  } });
}

async function persistArtistLinks(tx: Prisma.TransactionClient, releaseId: number, userId: number, external: RecordValue, trackMetadata: unknown, releaseArtistProfileId: number | null) {
  const artist = record(external.artist);
  const name = text(artist.name);
  const direNoteArtistId = text(artist.artist_id);
  const links = verifiedArtistStoreLinks(artist.links);
  if (!name || (!direNoteArtistId && !Object.keys(links).length)) return false;
  const ids = attachedArtistProfileIds(trackMetadata, releaseArtistProfileId);
  if (!ids.length) return false;
  const candidates = await tx.artistCard.findMany({ where: { id: { in: ids }, userId, archivedAt: null } });
  const matches = candidates.filter(card => card.artistName.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
  if (matches.length !== 1) return false;
  const card = matches[0];
  const binding = await tx.releaseArtistIdentity.findUnique({ where: { releaseId_artistCardId: { releaseId, artistCardId: card.id } } });
  // An older release's sync must never fill or rebind a corrected current card.
  if (binding && (!snapshotMatchesCard(binding, card) || (binding.providerArtistId && direNoteArtistId && binding.providerArtistId !== direNoteArtistId))) return false;
  if (binding?.corrected && !binding.providerArtistId && !direNoteArtistId) return false;
  if (binding && !binding.providerArtistId && direNoteArtistId) {
    if ((binding.spotifyUrl && links.spotify?.id !== verifiedArtistStoreLinks({ spotify: binding.spotifyUrl }).spotify?.id) || (binding.appleUrl && links.apple?.id !== verifiedArtistStoreLinks({ apple: binding.appleUrl }).apple?.id)) return false;
    const prior = await tx.releaseArtistIdentity.findMany({ where: { artistCardId: card.id, providerArtistId: direNoteArtistId, id: { not: binding.id } } });
    if (prior.some(row => conflictsWithHistoricalIdentity(row, binding))) {
      const field = `artist_${card.id}_identity_reused`;
      if (!(await tx.direNoteReconciliationDiscrepancy.findFirst({ where: { releaseId, field, status: 'open' } }))) await tx.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field, hymnValue: binding.spotifyUrl ?? '', direNoteValue: direNoteArtistId, severity: 'critical' } });
      return false;
    }
    await tx.releaseArtistIdentity.update({ where: { id: binding.id }, data: { providerArtistId: direNoteArtistId } });
  }
  let changed = false;
  if (direNoteArtistId && /^\d+$/.test(direNoteArtistId)) {
    if (!card.direNoteArtistId || card.direNoteArtistId === direNoteArtistId) {
      const result = await tx.artistCard.updateMany({ where: { id: card.id, direNoteArtistId: card.direNoteArtistId }, data: { direNoteArtistId } });
      changed ||= result.count > 0;
    } else {
      const field = `artist_${card.id}_direnote_id`;
      const discrepancy = await tx.direNoteReconciliationDiscrepancy.findFirst({ where: { releaseId, field, status: "open" } });
      if (!discrepancy) await tx.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field, hymnValue: card.direNoteArtistId, direNoteValue: direNoteArtistId, severity: "critical" } });
      return false;
    }
  }
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
      const result = await tx.artistCard.updateMany({ where: { id: card.id, [field]: current }, data: { [field]: received, ...(idField && providerId ? { [idField]: providerId } : {}), direNoteLastSyncedAt: new Date() } });
      changed ||= result.count > 0;
    } else {
      const fieldName = `artist_${card.id}_link_${provider}`;
      const discrepancy = await tx.direNoteReconciliationDiscrepancy.findFirst({ where: { releaseId, field: fieldName, status: "open" } });
      if (!discrepancy) await tx.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field: fieldName, hymnValue: current, direNoteValue: received, severity: "warning" } });
    }
  }
  if (changed && binding && !binding.corrected) {
    const updated = await tx.artistCard.findUniqueOrThrow({ where: { id: card.id } });
    const identity = cardIdentity(updated);
    await tx.releaseArtistIdentity.update({ where: { id: binding.id }, data: {
      ...(!binding.spotifyUrl && identity.spotifyUrl ? { spotifyUrl: identity.spotifyUrl } : {}),
      ...(!binding.appleUrl && identity.appleUrl ? { appleUrl: identity.appleUrl } : {}),
      ...(!binding.youtubeUrl && identity.youtubeUrl ? { youtubeUrl: identity.youtubeUrl } : {}),
      ...(!binding.confirmedAt ? { sourceFingerprint: artistIdentityFingerprint(updated) } : {})
    } });
  }
  return changed;
}

async function persistSongwriterIdsFromTrack(tx: Prisma.TransactionClient, releaseId: number, trackId: number, external: RecordValue) {
  let changed = false;
  const contributions = await tx.trackContribution.findMany({ where: { trackId, role: { in: ["SONGWRITER", "LYRICIST", "COMPOSER"] }, party: { mergedIntoId: null } }, include: { party: true } });
  for (const [key, roles] of [["songwriter", ["SONGWRITER", "LYRICIST"]], ["composer", ["COMPOSER"]]] as const) {
    const remote = record(external[key]);
    const songwriterId = text(remote.songwriter_id);
    const name = text(remote.name);
    if (!/^\d+$/.test(songwriterId) || !name) continue;
    const matches = contributions.filter(item => (roles as readonly string[]).includes(item.role) && (item.creditedName.trim().toLocaleLowerCase() === name.toLocaleLowerCase() || item.party.legalName?.trim().toLocaleLowerCase() === name.toLocaleLowerCase()));
    const parties = [...new Map(matches.map(item => [item.party.id, item.party])).values()];
    if (parties.length !== 1) continue;
    const party = parties[0];
    if (!party.direNoteSongwriterId || party.direNoteSongwriterId === songwriterId) {
      const result = await tx.contributorParty.updateMany({ where: { id: party.id, direNoteSongwriterId: party.direNoteSongwriterId }, data: { direNoteSongwriterId: songwriterId } });
      changed ||= result.count > 0;
    } else {
      const field = `contributor_${party.id}_direnote_songwriter_id`;
      const discrepancy = await tx.direNoteReconciliationDiscrepancy.findFirst({ where: { releaseId, field, status: "open" } });
      if (!discrepancy) await tx.direNoteReconciliationDiscrepancy.create({ data: { releaseId, trackId, field, hymnValue: party.direNoteSongwriterId, direNoteValue: songwriterId, severity: "critical" } });
    }
  }
  return changed;
}

export function mapDireNoteStatus(value: unknown) {
  const status = text(value).toLowerCase();
  if (status === "live") return "live";
  if (/reject|declin|fail|invalid|denied|cancel(?:led|ed)?/.test(status)) return "rejected";
  if (providerRequiresCorrections(status)) return "changes_required";
  if (/^(scheduled(?:\b.*)?|approved|accepted|ready|ready for distribution)$/.test(status)) return "scheduled";
  if (/deliver|distribut/.test(status)) return "delivered";
  if (/pending|process|review|queue|ingest/.test(status)) return "processing";
  return "unknown";
}

export function rejectOrCorrectionStatus(value: unknown): "rejected" | "changes_required" | null {
  if (typeof value !== "object" || value === null) return null;
  const seen = new Set<unknown>();
  const walk = (node: unknown): "rejected" | "changes_required" | null => {
    if (node === null || node === undefined) return null;
    if (seen.has(node)) return null;
    seen.add(node);
    if (typeof node === "string") {
      const status = node.trim();
      if (!status) return null;
      const normalized = status.toLowerCase();
      if (/reject|declin|fail|invalid|denied|cancel(?:led|ed)?/.test(normalized)) return "rejected";
      if (providerRequiresCorrections(normalized)) return "changes_required";
      return null;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const detected = walk(item);
        if (detected) return detected;
      }
      return null;
    }
    if (typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        // Titles, lyrics, artist names and URLs can contain words such as
        // "Rejected". Only status fields are authoritative lifecycle facts.
        if (typeof child === "string" && !["status", "release_status", "track_status", "delivery_status", "remarks"].includes(key)) continue;
        const detected = walk(child);
        if (detected) return detected;
      }
    }
    return null;
  };
  return walk(value);
}

function aggregateReleaseStatus(tracks: RecordValue[], releaseStatus: unknown, releaseDate: Date) {
  const statuses = [mapDireNoteStatus(releaseStatus), ...tracks.map((track) => mapDireNoteStatus(track.status))].filter((status) => status !== "unknown");
  if (!statuses.length) return { provider: "unknown", canonical: null } as const;
  if (statuses.some((status) => status === "changes_required")) return { provider: "changes_required", canonical: "changes_requested" as ReleaseStatus } as const;
  if (statuses.some((status) => status === "rejected")) return { provider: "rejected", canonical: "rejected" as ReleaseStatus } as const;
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

function hasExplicitProviderSchedule(payload: RecordValue, release: RecordValue): boolean {
  const scheduleTerms = /\b(scheduled|ready for distribution|approved for distribution|release date approved)\b/i;
  const releaseStatuses = [payload.status, payload.release_status, payload.delivery_status, release.status, release.release_status, release.delivery_status];
  return releaseStatuses.some(status => typeof status === "string" && scheduleTerms.test(status));
}

function normalizeProviderScheduleStatus(status: { provider: string; canonical: ReleaseStatus | null }, release: { releaseTiming: string | null }) {
  if (status.provider !== "scheduled") return status;
  if (release.releaseTiming !== "schedule_release") {
    return { provider: "processing", canonical: "distributor_processing" as ReleaseStatus };
  }
  return status;
}

/** Fetches the documented UPC lookup and caches provider facts without overwriting HYMN metadata. */
export async function syncDireNoteRelease(releaseId: number, actorId?: number | null, options: { deadlineAt?: number } = {}) {
  // A durable lease spans HTTP without holding a database connection open.
  const leaseKey = `direnote-release-sync:${releaseId}`;
  const runId = randomUUID();
  const acquired = await prisma.$transaction(async lock => {
    const rows = await lock.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422028, ${releaseId}::integer) AS locked`;
    if (!rows[0]?.locked) return false;
    const leases = await lock.$queryRaw<Array<{ run_id: string }>>`
      INSERT INTO "cron_leases" ("lease_key", "run_id", "leased_until", "updated_at")
      VALUES (${leaseKey}, ${runId}, NOW() + INTERVAL '5 minutes', NOW())
      ON CONFLICT ("lease_key") DO UPDATE SET "run_id" = EXCLUDED."run_id", "leased_until" = EXCLUDED."leased_until", "updated_at" = NOW()
      WHERE "cron_leases"."leased_until" < NOW() RETURNING "run_id"`;
    return leases[0]?.run_id === runId;
  }, { timeout: 10_000, maxWait: 5_000 });
  if (!acquired) throw new Error("DireNote release is already being synchronized or submitted.");
  try { return await syncCurrentDireNoteRelease(releaseId, actorId, options.deadlineAt); }
  catch (error) {
    const message = String(redactDireNoteDiagnostic(error instanceof Error ? error.message : "DireNote synchronization failed.")).slice(0, 1000);
    await prisma.release.update({ where: { id: releaseId }, data: { direNoteSyncError: message, direNoteLastAttemptedAt: new Date() } }).catch(() => undefined);
    await prisma.direNoteLog.create({ data: { releaseId, action: "release_sync_failed", success: false, errorMessage: message, createdByAdminId: actorId ?? null } }).catch(() => undefined);
    throw error;
  }
  finally {
    await prisma.$executeRaw`UPDATE "cron_leases" SET "leased_until" = NOW(), "updated_at" = NOW() WHERE "lease_key" = ${leaseKey} AND "run_id" = ${runId}`;
  }
}

async function syncCurrentDireNoteRelease(releaseId: number, actorId?: number | null, deadlineAt?: number) {
  const requestTimeout = (maximum: number) => {
    const remaining = deadlineAt ? deadlineAt - Date.now() : maximum;
    if (remaining < 1000) throw new Error("DireNote sync deferred to the next cron run: request time budget exhausted.");
    return Math.min(maximum, remaining);
  };
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { tracks: { orderBy: { trackNumber: "asc" } } } });
  if (!release) throw new Error("Release not found.");
  const releaseTiming = String(record(release.metadata).releaseTiming ?? "quick_release");
  const attempt = await ensureCurrentDireNoteAttempt(releaseId);
  if (record(record(release.metadata).direNote).identifierAssignmentPending === true && ['queued', 'processing'].includes(attempt.providerStatus ?? '')) {
    return { success: true, releaseId, attemptId: attempt.id, skipped: 'identifier_assignment_pending' as const };
  }
  const suppressAmendmentNotifications = Number(record(attempt.responseRedacted).amendmentRequestId) > 0;
  const corrections = record(attempt.corrections);
  if (corrections.status === "customer_resolved") {
    return { success: true, releaseId, attemptId: attempt.id, skipped: "corrections_resolved_waiting_for_resubmission" as const };
  }
  // A submitted current attempt is authoritative provider-acceptance evidence.
  // Repair a stale local handoff projection before any status lookup, without
  // calling ingest again.
  if (["SUBMITTING_TO_DISTRIBUTOR", "QUEUED_FOR_DISTRIBUTION"].includes(release.status) && attempt.state === "submitted") {
    await updateDetailedReleaseStatus(releaseId, "sent_to_distributor", "DireNote submission was already accepted; reconciliation repaired the stale handoff status.", undefined, { manualOverride: true, actorType: "system", notify: !suppressAmendmentNotifications });
    release.status = "SENT_TO_DISTRIBUTOR" as typeof release.status;
  }
  const attemptTracks = Array.isArray(attempt.trackIdentifiers) ? attempt.trackIdentifiers.map(record) : [];
  const mappingTracks = release.tracks.map(track => {
    const snapshot = attemptTracks.find(item => item.id === track.id);
    return { ...track, isrc: snapshot ? text(snapshot.isrc) || null : track.isrc, providerTrackId: text(snapshot?.providerTrackId) || null };
  });
  let lookupUpc = normalizeDireNoteUpc(attempt.upc);
  let result: Awaited<ReturnType<typeof getDireNoteReleaseInformation>> | null = null;
  if (!lookupUpc) {
    const isrc = mappingTracks.map(track => normalized(track.isrc ?? "")).find(value => /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(value));
    if (!isrc && !attempt.providerReference) throw new Error("Awaiting DireNote identifiers: the new submission has not returned a UPC, ISRC, or release reference yet.");
    let lookupError: string | null = null;
    if (isrc) {
      await reserveDireNoteRequest("upc_lookup", releaseId, actorId);
      // Identifier discovery only. Never import this report into the royalty ledger.
      const report = await getDireNoteRevenueReport(isrc);
      lookupUpc = report.success ? upcFromDireNoteIsrcReport(report.data, isrc, release.title) : null;
      const lookupOutcome = lookupUpc ? "UPC_FOUND_AND_VERIFIED" : report.success
        ? (report.data ? "UPC_NOT_YET_ASSIGNED" : "UPC_RESPONSE_MISSING")
        : report.httpStatus === 401 ? "PROVIDER_AUTH_FAILED" : "PROVIDER_UNAVAILABLE";
      lookupError = lookupUpc ? null : report.success
        ? `Awaiting UPC (${lookupOutcome}): DireNote has not returned a numeric UPC for this ISRC and release title.`
        : report.httpStatus === 401 ? "DIRENOTE_STATUS_AUTH_FAILED (PROVIDER_AUTH_FAILED, HTTP 401): Identifier discovery authentication failed." : `PROVIDER_UNAVAILABLE: DireNote UPC lookup failed (HTTP ${report.httpStatus ?? "unavailable"}). Check provider credentials or retry later.`;
      await prisma.direNoteLog.create({ data: {
        releaseId, action: "upc_lookup", httpStatus: report.httpStatus, success: Boolean(lookupUpc),
        requestPayloadRedacted: { isrc }, responseJson: { isrc, upc: lookupUpc, outcome: lookupOutcome },
        errorMessage: lookupError, createdByAdminId: actorId ?? null
      } });
    } else {
      lookupError = "Awaiting DireNote identifiers: the accepted resubmission has no assigned UPC or ISRC yet.";
    }
    if (!lookupUpc && attempt.providerReference) {
      const providerReference = text(attempt.providerReference);
      for (const key of ["release_id", "distributor_release_id"] as const) {
        await reserveDireNoteRequest(`release_information_${key}`, releaseId, actorId);
        const referenceResult = await getDireNoteReleaseInformationByReference(providerReference, key, { timeoutMs: requestTimeout(20_000) });
        const referenceUpc = referenceResult.success ? upcFromDireNoteResponse(referenceResult.data) : null;
        await prisma.direNoteLog.create({ data: {
          releaseId, action: `release_information_${key}`, httpStatus: referenceResult.httpStatus, success: Boolean(referenceUpc),
          requestPayloadRedacted: { [key]: providerReference, attemptId: attempt.id }, responseJson: redactDireNoteDiagnostic(referenceResult.data) as never,
          errorMessage: referenceUpc ? null : referenceResult.error ?? "DireNote did not return a numeric UPC for this release reference.", createdByAdminId: actorId ?? null
        } });
        const referenceCorrections = referenceResult.success
          ? extractDireNoteCorrections(redactDireNoteDiagnostic(record(referenceResult.data)) as RecordValue, mappingTracks, releaseId, attempt.id)
          : [];
        if (referenceUpc || referenceCorrections.length) {
          lookupUpc = referenceUpc;
          result = referenceResult;
          break;
        }
      }
    }
    if (!lookupUpc && !result) {
      await prisma.release.update({ where: { id: releaseId }, data: { direNoteLastAttemptedAt: new Date(), direNoteSyncError: lookupError } });
      throw new Error(lookupError!);
    }
  }
  if (!result) await reserveDireNoteRequest("release_information", releaseId, actorId);
  await prisma.release.update({ where: { id: releaseId }, data: { direNoteLastAttemptedAt: new Date(), direNoteSyncError: null } });
  result ??= await getDireNoteReleaseInformation(lookupUpc!, { timeoutMs: requestTimeout(20_000) });
  for (let retry = 0; lookupUpc && !result.success && retry < 2 && (result.httpStatus === null || result.httpStatus >= 500); retry++) {
    if (deadlineAt && deadlineAt - Date.now() < 2500) break;
    await new Promise(resolve => setTimeout(resolve, 500 * 2 ** retry));
    await reserveDireNoteRequest("release_information_retry", releaseId, actorId);
    result = await getDireNoteReleaseInformation(lookupUpc, { timeoutMs: requestTimeout(20_000) });
  }
  if (result.httpStatus === 429) {
    await prisma.direNoteLog.create({ data: { releaseId, action: "provider_rate_limit", success: false, httpStatus: 429, responseJson: { retryAt: new Date(Date.now() + Math.max(60, result.retryAfterSeconds ?? 3600) * 1000).toISOString() } } });
  }
  const payload = record(result.data);
  const remoteRelease = record(payload.release);
  const remoteTracks = currentDireNoteTracks(Array.isArray(payload.tracks) ? payload.tracks.map(record) : Array.isArray(remoteRelease.tracks) ? remoteRelease.tracks.map(record) : []);
  const currentPayload = { ...payload, tracks: remoteTracks, release: { ...remoteRelease, ...(Array.isArray(remoteRelease.tracks) ? { tracks: remoteTracks } : {}) } };
  const withdrawn = confirmsDireNoteWithdrawal({ upc: normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc }, payload);
  const providerCorrections = withdrawn ? [] : extractDireNoteCorrections(redactDireNoteDiagnostic(currentPayload) as RecordValue, mappingTracks, releaseId, attempt.id);
  const explicitProviderStatus = rejectOrCorrectionStatus(currentPayload);
  const lifecycleStatus = aggregateReleaseStatus(remoteTracks, remoteRelease.status ?? payload.status, release.releaseDate);
  if (result.success && !withdrawn && lookupUpc && (providerCorrections.length || explicitProviderStatus || providerRequiresCorrections(remoteRelease.status) || remoteTracks.some(track => providerRequiresCorrections(track.status)))) {
    try {
      const reviewFingerprint = createHash("sha256").update(JSON.stringify({
        corrections: direNoteCorrectionFingerprint(providerCorrections),
        releaseStatus: remoteRelease.status ?? payload.status,
        trackReviews: remoteTracks.map(track => ({ isrc: track.isrc, status: track.status, remarks: track.remarks ?? track.review_remarks ?? track.correction_remarks }))
      })).digest("hex");
      const sourceBinding=record(record(release.metadata).direNote);
      const sourceUpc = (sourceBinding.qcSourceAttemptId===attempt.id ? normalizeDireNoteUpc(sourceBinding.qcSourceUpc) : null) ?? providerQcSourceUpc(currentPayload) ?? lookupUpc;
      const { raw: qc, report } = await fetchBoundReleaseQcReport({ releaseId, attemptId: attempt.id, upc: lookupUpc, sourceUpc, tracks: mappingTracks, reviewFingerprint, actorId, timeoutMs: requestTimeout(15000) });
      if (qc) {
        // Bind source report rows to verified local ISRCs before extracting explicit failures.
        const verifiedTracks = Array.isArray(qc.tracks) ? qc.tracks.map((row, index) => {
          const remote = record(row);
          const bound = report?.tracks.find(track => track.sourceIsrc === text(remote.isrc));
          return { ...remote, ...(bound?.localTrackId ? { isrc: bound.isrc } : {}), track_number: index + 1 };
        }) : [];
        const detailed = extractDireNoteCorrections(direNoteQcCorrectionPayload({ ...qc, tracks: verifiedTracks }), mappingTracks, releaseId, attempt.id, true);
        for (const issue of detailed) if (!providerCorrections.some(existing => existing.fingerprint === issue.fingerprint)) providerCorrections.push(issue);
      }
      if (report?.verified) {
        const reportFingerprint = createHash('sha256').update(JSON.stringify(report.tracks.map(track=>({localTrackId:track.localTrackId,sourceIsrc:track.sourceIsrc,matches:track.matches})))).digest('hex');
        for (const note of qcMatchCorrectionNotes(report)) {
          const detailTrack = report.tracks[Number(note.field.split('.')[1])];
          const localIndex = mappingTracks.findIndex(track => track.id === detailTrack.localTrackId);
          if (localIndex < 0) continue;
          const fingerprint = createHash('sha256').update(`${attempt.id}:${detailTrack.localTrackId}:${reportFingerprint}`).digest('hex');
          providerCorrections.push({ ...note, field: `tracks.${localIndex}.providerQc`, fingerprint });
        }
      }
    } catch (error) { console.warn("Track QC enrichment deferred; review remarks remain available", { releaseId, error: String(redactDireNoteDiagnostic(error instanceof Error ? error.message : "QC unavailable")) }); }
  }
  // DireNote uses Rejected for fixable review requests too. Actionable remarks
  // must enter the correction workflow; a bare rejection remains a rejection.
  const hasVerifiedProviderListing = Boolean(
    result.success && lookupUpc &&
    normalizeDireNoteUpc(remoteRelease.upc_code) === lookupUpc &&
    remoteTracks.length === release.tracks.length &&
    remoteTracks.every(remote => mappingTracks.some(track =>
      normalized(text(remote.isrc)) === normalized(text(track.isrc)) && validIsrc(text(remote.isrc))
    ))
  );
  const providerScheduleConfirmed = hasExplicitProviderSchedule(payload, remoteRelease);
  const mappedLifecycleStatus = normalizeProviderScheduleStatus(lifecycleStatus, { releaseTiming });
  const scheduleEligibleStatus = providerScheduleConfirmed && releaseTiming === "schedule_release"
    ? mappedLifecycleStatus
    : mappedLifecycleStatus.provider === "scheduled"
      ? { provider: "processing", canonical: "distributor_processing" as ReleaseStatus }
      : mappedLifecycleStatus;
  const lifecycleForRelease = releaseTiming === "quick_release" && ["awaiting_live_confirmation", "delivered"].includes(mappedLifecycleStatus.canonical ?? "")
    ? { provider: "processing", canonical: "distributor_processing" as ReleaseStatus }
    : scheduleEligibleStatus;
  const aggregateStatus = withdrawn ? { provider: "rejected", canonical: "rejected" as ReleaseStatus } : explicitProviderStatus === "changes_required" || providerCorrections.length
      ? { provider: "changes_required", canonical: "changes_requested" as ReleaseStatus }
      : explicitProviderStatus === "rejected"
        ? { provider: "rejected", canonical: "rejected" as ReleaseStatus }
        : hasVerifiedProviderListing && lifecycleStatus.provider === "unknown"
          ? { provider: "processing", canonical: "distributor_processing" as ReleaseStatus }
          : lifecycleForRelease;
  for (const issue of providerCorrections) issue.note = issue.note.replace(/https:\/\/dashboard\.direnotemedia\.com\/release_detection_analysis\.php\?upc=\d+/g, `${getPublicAppUrl()}/dashboard/releases/${releaseId}/qc-report`);
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
  if (lifecycleStatus.provider === "unknown" && !providerCorrections.length && !hasVerifiedProviderListing) {
    const message = "DIRENOTE_MALFORMED_RESPONSE: No release or track status returned.";
    await prisma.release.update({ where: { id: releaseId }, data: { direNoteSyncError: message } });
    throw new Error(message);
  }
  if (lookupUpc && normalizeDireNoteUpc(remoteRelease.upc_code) && normalizeDireNoteUpc(remoteRelease.upc_code) !== lookupUpc) throw new Error("DireNote returned a different UPC from the current lookup. No release identifiers were changed.");
  if (!normalizeDireNoteUpc(attempt.upc) && lookupUpc) {
    const confirmedUpc = normalizeDireNoteUpc(remoteRelease.upc_code);
    const matchingTrack = remoteTracks.some(remote => release.tracks.some(track => track.isrc && normalized(track.isrc) === normalized(text(remote.isrc))));
    if (confirmedUpc !== lookupUpc || !matchingTrack) {
      throw new Error("DireNote UPC recovery could not verify the release's UPC and track ISRC. No identifiers were changed.");
    }
  }

  let artistLinksChanged = false;
  let songwriterIdsChanged = false;
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422027, ${releaseId}::integer)`;
    const stillCurrent = await tx.distributionSubmissionAttempt.findFirst({ where: { id: attempt.id, isCurrent: true } });
    if (!stillCurrent) throw new Error("DireNote attempt was superseded during status lookup. Retry the current attempt.");
    const currentRelease = await tx.release.findUniqueOrThrow({ where: { id: releaseId }, include: { tracks: true } });
    for (const cardId of selectedReleaseArtistIds(currentRelease.tracks, currentRelease.artistProfileId)) await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422030, ${cardId}::integer)`;
    const openDiscrepancies = new Set((await tx.direNoteReconciliationDiscrepancy.findMany({ where: { releaseId, status: "open" }, select: { field: true } })).map(item => item.field));
    const receivedUpc = normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc;
    if (record(record(currentRelease.metadata).direNote).identifierAssignmentPending === true && (!receivedUpc || remoteTracks.length !== currentRelease.tracks.length || currentRelease.tracks.some(track => {
      const remote = remoteTracks.find(row => matchDireNoteTrack(row, mappingTracks)?.id === track.id);
      return !remote || !validIsrc(text(remote.isrc));
    }))) throw new Error('The amended release is still awaiting a complete verified identifier set. Previous identifiers remain locked.');
    const replacingIdentifiers = record(record(currentRelease.metadata).direNote).reconciliationInProgress === true;
    if (receivedUpc && (!validReleaseBarcode(receivedUpc) || (!replacingIdentifiers && currentRelease.upc && currentRelease.upc !== receivedUpc))) {
      throw new Error("DireNote UPC conflicts with the stored release identity or has an invalid check digit. No identifiers were changed.");
    }
    for (const track of currentRelease.tracks) {
      const external = remoteTracks.find(remote => matchDireNoteTrack(remote, mappingTracks)?.id === track.id);
      const receivedIsrc = text(external?.isrc);
      if (receivedIsrc && (!validIsrc(receivedIsrc) || (!replacingIdentifiers && track.isrc && track.isrc !== receivedIsrc))) {
        throw new Error(`DireNote ISRC conflicts with track ${track.trackNumber}'s stored recording identity or is invalid. No identifiers were changed.`);
      }
    }
    await tx.distributionSubmissionAttempt.update({ where: { id: attempt.id }, data: {
      lastCheckedAt: new Date(), providerStatus: aggregateStatus.provider, rawStatusPayload: safe as never,
      upc: normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc,
      trackIdentifiers: mappingTracks.map(track => {
        const remote = remoteTracks.find(item => matchDireNoteTrack(item, mappingTracks)?.id === track.id);
        return { id: track.id, title: track.title, trackNumber: track.trackNumber, isrc: text(remote?.isrc) || track.isrc, providerTrackId: text(remote?.track_id ?? remote?.id) || track.providerTrackId };
      })
    } });
    for (const track of release.tracks) {
      const external = remoteTracks.find(remote => matchDireNoteTrack(remote, mappingTracks)?.id === track.id);
      if (!external) continue;
      const externalIsrc = text(external.isrc);
      if (externalIsrc && normalized(externalIsrc) !== normalized(track.isrc ?? "")) await tx.externalIdentifierHistory.create({ data: { releaseId, trackId: track.id, provider: "direnote", identifierType: "isrc", previousValue: track.isrc, canonicalValue: externalIsrc, source: "release_information_sync" } });
      await tx.track.update({ where: { id: track.id }, data: { isrc: externalIsrc || track.isrc, distributorStatus: mapDireNoteStatus(external.status), metadata: json({ ...(record(track.metadata)), direNote: { ...(record(record(track.metadata).direNote)), lastSyncedAt: new Date().toISOString(), external: redactDireNoteDiagnostic(external) } }) } });
      const artistChanged = await persistArtistLinks(tx, releaseId, release.userId, external, track.metadata, release.artistProfileId);
      artistLinksChanged = artistChanged || artistLinksChanged;
      const songwriterChanged = await persistSongwriterIdsFromTrack(tx, releaseId, track.id, external);
      songwriterIdsChanged = songwriterChanged || songwriterIdsChanged;
      const localMetadata = record(track.metadata);
      const trackComparisons = [
        ["language", localMetadata.trackLanguage, external.track_language], ["genre", localMetadata.trackGenre, external.track_genre],
        ["subgenre", localMetadata.trackSubgenre, external.track_subgenre], ["version", localMetadata.trackVersion, external.track_version],
        ["previously_released", localMetadata.previouslyReleased, external.previously_released], ["explicit", localMetadata.explicitLyrics, external.explicit_lyrics]
      ];
      for (const [property, localValue, remoteValue] of trackComparisons) {
        const hymnValue = text(localValue); const direNoteValue = text(remoteValue);
        if (!hymnValue || !direNoteValue || normalized(hymnValue) === normalized(direNoteValue)) continue;
        const field = `track_${track.id}_${property}`;
        if (!openDiscrepancies.has(field)) {
          await tx.direNoteReconciliationDiscrepancy.create({ data: { releaseId, trackId: track.id, field, hymnValue, direNoteValue, severity: "warning" } });
          openDiscrepancies.add(field);
        }
      }
    }
    const remoteUpc = normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc;
    const comparisons = [
      ...(!replacingIdentifiers ? [{ field: "upc", hymn: release.upc, external: remoteUpc, severity: "critical" }] : []),
      { field: "release_title", hymn: release.title, external: text(remoteRelease.album_name), severity: "warning" },
      { field: "release_type", hymn: release.releaseType, external: text(remoteRelease.type_of_release), severity: "warning" },
      { field: "label_name", hymn: text(record(release.metadata).labelName), external: text(remoteRelease.label_name), severity: "warning" },
      { field: "release_date", hymn: release.releaseDate?.toISOString().slice(0, 10), external: text(remoteRelease.track_release_date).slice(0, 10), severity: "warning" },
      { field: "track_count", hymn: String(release.tracks.length), external: String(remoteTracks.length), severity: "warning" }
    ].filter(item => item.external && normalized(item.hymn ?? "") !== normalized(item.external));
    for (const comparison of comparisons) {
      if (!openDiscrepancies.has(comparison.field)) {
        await tx.direNoteReconciliationDiscrepancy.create({ data: { releaseId, field: comparison.field, hymnValue: comparison.hymn ?? Prisma.JsonNull, direNoteValue: comparison.external ?? Prisma.JsonNull, severity: comparison.severity } });
        openDiscrepancies.add(comparison.field);
      }
    }
    if (remoteUpc && remoteUpc !== release.upc) await tx.externalIdentifierHistory.create({ data: { releaseId, provider: "direnote", identifierType: "upc", previousValue: release.upc, canonicalValue: remoteUpc, source: "release_information_sync" } });
    await tx.release.update({ where: { id: releaseId }, data: { ...(remoteUpc ? { upc: remoteUpc } : {}), direNoteStatus: aggregateStatus.provider, direNoteLastSyncedAt: new Date(), direNoteSyncError: null, metadata: json({ ...(record(release.metadata)), upcCode: remoteUpc ?? release.upc, direNote: { ...previousDireNote, reconciliationInProgress: false, identifierAssignmentPending: false, lastSyncedAt: new Date().toISOString(), status: aggregateStatus.provider, release: redactDireNoteDiagnostic(remoteRelease), correctionMessages } }) } });
  }, { timeout: 60_000, maxWait: 10_000 });
  if (aggregateStatus.canonical === 'live') await completeArtistAmendment(releaseId, attempt.id, remoteTracks);
  const amendmentRequestId = Number(record(attempt.responseRedacted).amendmentRequestId);
  if (amendmentRequestId > 0 && ['changes_requested', 'rejected', 'delivery_failed'].includes(aggregateStatus.canonical ?? '')) { const { flagAmendmentManualQc } = await import('./release-amendment-automation'); await flagAmendmentManualQc(amendmentRequestId, correctionMessages.join(' ') || 'The delivery report requires manual QC. Inspect the detailed report before retrying.'); }
  const previousStatus = release.status.toLowerCase() as ReleaseStatus;
  if (artistLinksChanged) {
    await refreshMissingSpotifyArtistPhotos(release.userId).catch(() => undefined);
  }
  const staleRegression =
    ["takedown_requested", "takedown_processing", "taken_down", "archived"].includes(previousStatus) ||
    (previousStatus === "live" && aggregateStatus.canonical !== "live") ||
    (previousStatus === "partially_live" && !["live", "partially_live"].includes(aggregateStatus.canonical ?? "")) ||
    (previousStatus === "rejected" && ["live", "partially_live"].includes(aggregateStatus.canonical ?? ""));
  const providerAccepted = ["scheduled", "awaiting_live_confirmation", "partially_live", "live"].includes(aggregateStatus.provider) ||
    (hasVerifiedProviderListing && !providerCorrections.length && !explicitProviderStatus &&
      (String(remoteRelease.status ?? payload.status ?? '').trim().toLowerCase() === 'accepted' ||
        (remoteTracks.length > 0 && remoteTracks.every(track => /^(approved|accepted)$/i.test(String(track.status ?? '').trim())))));
  const customerWorkflow = !providerAccepted && ["changes_requested", "resubmitted", "under_review", "in_qc_queue", "in_queue", "submitted", "approved", "queued_for_distribution"].includes(previousStatus);
  const repeatCorrection = previousDireNote.appliedCorrectionFingerprint === correctionFingerprint;
  if (!staleRegression && aggregateStatus.canonical && (aggregateStatus.canonical !== previousStatus || (aggregateStatus.canonical === "changes_requested" && !repeatCorrection))
    && !(customerWorkflow && !["changes_requested", "rejected"].includes(aggregateStatus.canonical))) {
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
        manualOverride: true, actorType: "system", notify: !repeatCorrection && !suppressAmendmentNotifications, reviewChanged: record(attempt.corrections).fingerprint !== correctionFingerprint,
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
      await updateDetailedReleaseStatus(releaseId, aggregateStatus.canonical, `DireNote status confirmed: ${aggregateStatus.provider}.`, undefined, { manualOverride: true, actorType: "system", notify: !suppressAmendmentNotifications });
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
  const outcome = { success: true, releaseId, attemptId: attempt.id, upc: normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc, status: aggregateStatus.provider, trackCount: remoteTracks.length, diff: { statusChanged: aggregateStatus.canonical !== null && aggregateStatus.canonical !== previousStatus, upcChanged: Boolean((normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc) && (normalizeDireNoteUpc(remoteRelease.upc_code) || lookupUpc) !== release.upc), isrcChanges: remoteTracks.filter(remote => { const track = mappingTracks.find(candidate => matchDireNoteTrack(remote, mappingTracks)?.id === candidate.id); return Boolean(track && text(remote.isrc) && normalized(text(remote.isrc)) !== normalized(track.isrc ?? "")); }).map(remote => text(remote.isrc)), correctionsChanged: providerCorrections.length > 0, artistLinksChanged, songwriterIdsChanged, anomalies: [] as string[] } };
  await prisma.direNoteLog.create({ data: { releaseId, action: "reconciliation_sync", success: true, requestPayloadRedacted: { attemptId: attempt.id, upc: lookupUpc }, responseJson: outcome as unknown as Prisma.InputJsonValue } });
  return outcome;
}

/** Returns the documented ISRC report. Accounting ingestion remains explicit and admin-controlled. */
export async function getDireNoteTrackRevenue(isrc: string, actorId?: number | null, importIntoLedger = false, options: { timeoutMs?: number } = {}) {
  const track = await prisma.track.findFirst({ where: { isrc: normalized(isrc) }, select: { releaseId: true } });
  await reserveDireNoteRequest("revenue_report", track?.releaseId ?? null, actorId);
  const result = await getDireNoteRevenueReport(isrc, options);
  const payload = record(result.data);
  await prisma.direNoteLog.create({ data: { releaseId: track?.releaseId ?? null, action: "revenue_report", httpStatus: result.httpStatus, success: result.success, requestPayloadRedacted: { isrc: normalized(isrc) }, responseJson: redactDireNoteDiagnostic(payload) as never, errorMessage: result.error ?? null, createdByAdminId: actorId ?? null } });
  if (!result.success) throw new Error(result.error || text(payload.message) || "DireNote revenue report lookup failed.");
  const ingestion = importIntoLedger && actorId ? await importDireNoteRevenueReport(payload, actorId) : null;
  return { report: payload, ingestion };
}
