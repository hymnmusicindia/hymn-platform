import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDetailedReleaseById, updateDetailedReleaseStatus } from "@/lib/distribution-db";

const RELEASE_ID = 21;
const REASON = "PLEASE REUPLOAD THE AUDIO FILES. THEY SEEM CORRUPTED.";

export async function POST(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new NextResponse(null, { status: 401 });

  const current = await getDetailedReleaseById(RELEASE_ID);
  if (!current || current.releaseTitle.toLowerCase() !== "magenta" || current.userId !== 19) {
    return NextResponse.json({ error: "The expected active Magenta release was not found." }, { status: 409 });
  }
  const release = await updateDetailedReleaseStatus(RELEASE_ID, "changes_requested", REASON, {
    reason: REASON,
    issueType: "audio",
    severity: "required_correction",
    fields: [{ field: "tracks.audio", label: "Audio files", note: REASON }],
    adminInternalNote: "Correction requested by HYMN after audio integrity review.",
    reviewedBy: "HYMN Admin"
  }, { manualOverride: true, actorType: "admin", notify: true });
  return NextResponse.json({ id: release?.id, title: release?.releaseTitle, status: release?.status, correctionReason: release?.correctionReason });
}
