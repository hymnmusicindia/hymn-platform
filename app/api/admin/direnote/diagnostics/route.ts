import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdminPermission } from "@/lib/access";
import { getDireNoteConfig } from "@/lib/direnote/direnote-config";
import { submitToDireNote } from "@/lib/direnote/direnote-client";
import { redactDireNoteDiagnostic } from "@/lib/direnote";
import { prisma } from "@/lib/prisma";
import { isPostgresPrisma } from "@/lib/distribution-db";

export const runtime = "nodejs";

function status() {
  const config = getDireNoteConfig();
  return { endpointConfigured: Boolean(config.endpoint), pinConfigured: Boolean(config.pin), clientIdConfigured: Boolean(config.clientId), configReady: config.isConfigured };
}

async function lastTest() {
  if (!isPostgresPrisma()) return null;
  const log = await prisma.direNoteLog.findFirst({ where: { action: "test_payload" }, orderBy: { createdAt: "desc" } });
  return log ? { success: log.success, httpStatus: log.httpStatus, response: redactDireNoteDiagnostic(log.responseJson ?? log.responseRaw ?? log.errorMessage), createdAt: log.createdAt } : null;
}

export async function GET() {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [lastSync, lastSuccessfulSync, stuckAttempts, anomalousReleases] = await Promise.all([
    prisma.direNoteSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.direNoteSyncRun.findFirst({ where: { status: "completed" }, orderBy: { completedAt: "desc" } }),
    prisma.distributionSubmissionAttempt.findMany({
      where: { provider: "direnote", isCurrent: true, OR: [
        { state: "processing", updatedAt: { lt: sixHoursAgo } },
        { state: "reconciliation_required" },
        { state: "submitted", providerStatus: { in: ["processing", "scheduled", "awaiting_live_confirmation", "partially_live"] }, lastCheckedAt: { lt: fourteenDaysAgo } }
      ] },
      select: { id: true, releaseId: true, state: true, providerStatus: true, startedAt: true, updatedAt: true, lastCheckedAt: true, safeError: true, release: { select: { title: true, status: true } } },
      orderBy: { updatedAt: "asc" }, take: 100
    }),
    prisma.release.findMany({
      where: { archivedAt: null, OR: [
        { status: { in: ["QUEUED_FOR_DISTRIBUTION", "SUBMITTING_TO_DISTRIBUTOR"] }, distributionSubmissions: { none: { provider: "direnote", state: { in: ["processing", "submitted", "reconciliation_required"] } } } },
        { status: "DRAFT", paymentStatus: "paid", updatedAt: { lt: sixHoursAgo } },
        { status: "DRAFT", direNoteStatus: { not: null } },
        { status: "LIVE", distributionSubmissions: { none: { provider: "direnote", state: "submitted" } } }
      ] },
      select: { id: true, title: true, status: true, paymentStatus: true, direNoteStatus: true, updatedAt: true },
      orderBy: { updatedAt: "asc" }, take: 100
    })
  ]);
  const lastSyncAt = lastSync?.startedAt.getTime() ?? 0;
  const syncHealth = !lastSyncAt ? "unknown" : Date.now() - lastSyncAt > 2 * 60 * 60 * 1000 ? "degraded" : lastSync?.status === "completed" ? "healthy" : "degraded";
  return NextResponse.json({ ...status(), lastTest: await lastTest(), syncHealth, lastSync: lastSync ? { ...lastSync, summary: redactDireNoteDiagnostic(lastSync.summary) } : null, lastSuccessfulSync: lastSuccessfulSync ? { completedAt: lastSuccessfulSync.completedAt, runId: lastSuccessfulSync.runId } : null,
    operationalHealth: {
      issueCount: stuckAttempts.length + anomalousReleases.length,
      stuckAttempts: stuckAttempts.map(item => ({ ...item, safeError: item.safeError?.slice(0, 500) ?? null })),
      anomalousReleases
    }
  });
}

export async function POST() {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  const now = new Date(); const releaseDate = new Date(now); releaseDate.setUTCDate(releaseDate.getUTCDate() + 5);
  const year = now.getUTCFullYear();
  const payload = {
    albumname: "Dummy API Release", typeOfRelease: "Single", albumGenre: "Pop", albumSubgenre: "Indie Pop", albumLanguage: "English",
    contenttype: "Original/Exclusive Licensed", trackReleaseDate: releaseDate.toISOString().slice(0, 10), labelName: "DireNote Test Label",
    cLine: `${year} DireNote Test Label`, pLine: `${year} DireNote Test Label`, cover_art_url: "https://picsum.photos/3000",
    artists: [{ name: "John Smith", spotify_url: "", instagram_url: "https://instagram.com/johnsmithmusic" }], featuring_artists: [],
    tracks: [{ trackName: "Dummy API Release", trackVersion: "", audio_url: "https://samplelib.com/lib/preview/wav/sample-3s.wav", explicitLyrics: "No", previewStart: "30", previouslyReleased: "No", producers: ["DireNote Studio"], songwriters: [{ name: "John Smith", ipi: "" }], composers: [{ name: "John Smith", ipi: "" }] }]
  };
  const result = await submitToDireNote(payload);
  const safeResponse = redactDireNoteDiagnostic(result.data ?? result.raw ?? null);
  const safeError = redactDireNoteDiagnostic(result.error ?? null);
  if (isPostgresPrisma()) await prisma.direNoteLog.create({ data: { action: "test_payload", httpStatus: result.httpStatus, success: result.success, requestPayloadRedacted: payload as any, responseRaw: typeof safeResponse === "string" ? safeResponse : null, responseJson: typeof safeResponse === "object" && safeResponse !== null ? safeResponse as Prisma.InputJsonValue : undefined, errorMessage: typeof safeError === "string" ? safeError : null, createdByAdminId: Number((admin as any).sub) || null } });
  return NextResponse.json({ ...status(), result: { success: result.success, httpStatus: result.httpStatus, response: safeResponse, error: safeError }, lastTest: await lastTest() }, { status: result.success ? 200 : 502 });
}

// vercel trigger 9
