import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import {
  createDistributionQueueEntry,
  getDetailedReleaseById,
  listDistributionQueueEntries,
  transitionDistributionQueueEntry
} from "@/lib/distribution-db";
import { buildDireNotePayloadForRelease, retrySubmission, submitRelease } from "@/lib/distribution-service";
import { redactDireNotePayload, validateDireNotePayload } from "@/lib/direnote";
import type { DistributionQueueStage } from "@/lib/types";

export const runtime = "nodejs";

async function getReleaseOrResponse(id: string) {
  const releaseId = Number(id);
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    return { response: NextResponse.json({ error: "Valid release id is required." }, { status: 400 }) };
  }
  const release = await getDetailedReleaseById(releaseId);
  if (!release) {
    return { response: NextResponse.json({ error: "Release not found." }, { status: 404 }) };
  }
  return { releaseId, release };
}

async function syncQueueStage(releaseId: number, nextStage: DistributionQueueStage, actorId: number | null, notes: string) {
  const queueEntry = (await listDistributionQueueEntries()).find((item) => item.releaseId === releaseId);
  if (!queueEntry) {
    return createDistributionQueueEntry({ releaseId, initialStage: nextStage, operatorId: actorId, notes });
  }
  if (queueEntry.currentStage === nextStage) return queueEntry;
  return transitionDistributionQueueEntry({ entryId: queueEntry.id, nextStage, operatorId: actorId, notes });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if ("error" in admin) return admin.error;

  const { id } = await params;
  const resolved = await getReleaseOrResponse(id);
  if ("response" in resolved) return resolved.response;

  const { searchParams } = new URL(request.url);
  const adminConfirmedExistingArtists = searchParams.get("adminConfirmedExistingArtists") === "true";
  const payload = await buildDireNotePayloadForRelease(resolved.release, {
    siteUrl: new URL(request.url).origin,
    adminConfirmedExistingArtists
  });
  const validation = validateDireNotePayload(payload, { adminConfirmedExistingArtists });

  return NextResponse.json({
    payload: redactDireNotePayload(payload),
    validation,
    ready: validation.ok
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if ("error" in admin) return admin.error;

  const { id } = await params;
  const resolved = await getReleaseOrResponse(id);
  if ("response" in resolved) return resolved.response;

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? "submit");
  const actorId = "sub" in admin ? admin.sub : null;
  const siteUrl = new URL(request.url).origin;
  const adminConfirmedExistingArtists = Boolean(body.adminConfirmedExistingArtists);

  if (action !== "retry") {
    await syncQueueStage(resolved.releaseId, "approved", actorId, "Admin approved release for DireNote submission.");
  }

  const result = action === "retry"
    ? await retrySubmission(resolved.releaseId, { actorId, siteUrl })
    : await submitRelease(resolved.releaseId, { actorId, siteUrl, adminConfirmedExistingArtists });

  return NextResponse.json(result, { status: result.submitted ? 200 : result.validation.ok ? 502 : 400 });
}

// vercel trigger
