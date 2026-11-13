import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { submitRelease } from "@/lib/distribution-service";
import { getPublicAppUrl } from "@/lib/public-app-url";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("distribution.submit"); if ("error" in admin) return admin.error;
  const reviewer = await requireAdminPermission("releases.review"); if ("error" in reviewer) return reviewer.error;
  const releaseId = Number((await params).id);
  if (!Number.isSafeInteger(releaseId) || releaseId <= 0) return NextResponse.json({ error: "Invalid release." }, { status: 400 });
  try {
    const result = await submitRelease(releaseId, { actorId: "sub" in admin ? admin.sub : null, siteUrl: getPublicAppUrl(request.url) });
    if ('queued' in result && result.queued) return NextResponse.json(result, { status: 202, headers: { 'Retry-After': String(result.retryAfterSeconds) } });
    return NextResponse.json(result, { status: "inProgress" in result && result.inProgress ? 202 : result.submitted ? 200 : result.validation.ok ? 502 : 400 });
  } catch {
    // Never describe an unconfirmed action as delivered or encourage a blind retry.
    return NextResponse.json({ submitted: false, releaseId, error: "HYMN could not complete this action. Your release is saved. Check Submission history for the delivery outcome before retrying.", historyUrl: `/admin?tab=releases&releaseId=${releaseId}` }, { status: 503 });
  }
}
// vercel trigger 9
