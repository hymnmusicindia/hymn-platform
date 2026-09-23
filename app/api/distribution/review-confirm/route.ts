import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { releaseReviewSnapshotHash } from "@/lib/release-review-snapshot";
import { getDetailedReleaseById } from "@/lib/distribution-db";
import { validateReleaseForDireNote } from "@/lib/direnote-readiness";
import { findReleaseIdentifierConflicts } from "@/lib/release-identifier-conflicts";

export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const releaseId = Number(body.releaseId);
  if (!Number.isInteger(releaseId)) return NextResponse.json({ error: "A release is required." }, { status: 400 });
  const release = await prisma.release.findFirst({ where: { id: releaseId, userId: auth.user.id, status: "DRAFT" }, select: { id: true } });
  if (!release) return NextResponse.json({ error: "Draft release not found." }, { status: 404 });
  const detailed = await getDetailedReleaseById(releaseId);
  if (!detailed || detailed.userId !== auth.user.id) return NextResponse.json({ error: "Draft release not found." }, { status: 404 });
  const validation = await validateReleaseForDireNote(detailed);
  const identifierConflicts = await findReleaseIdentifierConflicts({ releaseId, upc: detailed.upcCode, tracks: (detailed.tracks ?? []).map(track => ({ id: track.id, trackNumber: track.trackNumber, isrc: track.isrc, audioUrl: track.audioUrl })) });
  if (!validation.ready || identifierConflicts.length) return NextResponse.json({
    error: "Fix the release validation errors before payment.",
    code: "RELEASE_VALIDATION_FAILED",
    errors: [...validation.issues.map(issue => ({ code: issue.field.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), scope: issue.field.startsWith("tracks.") ? "track" : "release", field: issue.field, message: issue.message })), ...identifierConflicts.map(issue => ({ ...issue, scope: issue.field.startsWith("tracks.") ? "track" : "release" }))],
    warnings: validation.warnings
  }, { status: 422 });
  const metadataHash = await releaseReviewSnapshotHash(releaseId, auth.user.id);
  if (!metadataHash) return NextResponse.json({ error: "Draft release not found." }, { status: 404 });
  const confirmedAt = new Date();
  await prisma.release.update({ where: { id: releaseId }, data: { reviewConfirmedAt: confirmedAt, reviewConfirmedBy: auth.user.id, reviewMetadataHash: metadataHash } });
  return NextResponse.json({ confirmedAt: confirmedAt.toISOString(), metadataHash });
}
