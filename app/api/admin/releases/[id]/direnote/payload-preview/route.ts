import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { getDetailedReleaseById, logDistributionEvent } from "@/lib/distribution-db";
import { buildDireNotePayloadForRelease } from "@/lib/distribution-service";
import { redactDireNotePayload, validateDireNotePayload } from "@/lib/direnote";
import { getDireNoteConfig } from "@/lib/direnote/direnote-config";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("releases.read"); if ("error" in admin) return admin.error;
  const releaseId = Number((await params).id);
  if (!Number.isInteger(releaseId) || releaseId <= 0) return NextResponse.json({ error: "Valid release id is required." }, { status: 400 });
  const release = await getDetailedReleaseById(releaseId);
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const payload = await buildDireNotePayloadForRelease(release, { siteUrl: new URL(request.url).origin });
  const validation = validateDireNotePayload(payload);
  const redactedPayload = redactDireNotePayload(payload);
  const config = getDireNoteConfig();
  await logDistributionEvent({ releaseId, action: "payload_preview", createdByAdminId: Number((admin as any).sub) || null, requestPayload: redactedPayload, responsePayload: { validation }, success: validation.ok && config.isConfigured });
  return NextResponse.json({ payload: redactedPayload, validationIssues: validation.issues, missingFields: validation.issues.map((issue) => issue.field), configReady: config.isConfigured, releaseReady: validation.ok && config.isConfigured });
}

// vercel trigger 9
