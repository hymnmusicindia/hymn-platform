import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { syncDireNoteRelease } from "@/lib/direnote-service";
import { prisma } from "@/lib/prisma";
import { redactDireNoteDiagnostic } from "@/lib/direnote";

export const runtime = "nodejs";

// Read-only diagnostics: never contacts DireNote or changes release status.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("releases.read");
  if ("error" in admin) return admin.error;
  const releaseId = Number((await params).id);
  if (!Number.isInteger(releaseId) || releaseId < 1) return NextResponse.json({ error: "Valid release id is required." }, { status: 400 });
  const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { id: true, upc: true, status: true, direNoteLastSyncedAt: true, direNoteSyncError: true } });
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const log = await prisma.direNoteLog.findFirst({ where: { releaseId, action: "release_information" }, orderBy: { createdAt: "desc" }, select: { httpStatus: true, success: true, createdAt: true, responseJson: true, errorMessage: true } });
  return NextResponse.json({
    release,
    cronConfigured: Boolean(process.env.CRON_SECRET),
    syncEnabled: process.env.DIRENOTE_RELEASE_SYNC_ENABLED !== "false",
    validLookupUpc: /^\d{12,14}$/.test((release.upc ?? "").replace(/[\s-]/g, "")),
    lastLookup: log ? { ...log, responseJson: redactDireNoteDiagnostic(log.responseJson), errorMessage: redactDireNoteDiagnostic(log.errorMessage) } : null
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("releases.read");
  if ("error" in admin) return admin.error;
  const releaseId = Number((await params).id);
  if (!Number.isInteger(releaseId) || releaseId < 1) return NextResponse.json({ error: "Valid release id is required." }, { status: 400 });
  try { return NextResponse.json(await syncDireNoteRelease(releaseId, "sub" in admin ? Number(admin.sub) : null)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "DireNote sync failed." }, { status: 502 }); }
}
