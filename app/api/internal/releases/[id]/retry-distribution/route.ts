import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { retrySubmission } from "@/lib/distribution-service";
import { getPublicAppUrl } from "@/lib/public-app-url";

export const runtime = "nodejs";
export const maxDuration = 180;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(secret ? `Bearer ${secret}` : "");
  const received = Buffer.from(authorization);
  return Boolean(secret) && received.length === expected.length && timingSafeEqual(received, expected);
}

// Used by the Hostinger scheduler/recovery tooling when an approved release
// needs a provider retry. It deliberately runs in the deployed Node process,
// so private files are published from the same Hostinger filesystem that hosts
// the public proof URL.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const releaseId = Number((await params).id);
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    return NextResponse.json({ error: "A valid release id is required." }, { status: 400 });
  }

  try {
    const result = await retrySubmission(releaseId, { siteUrl: getPublicAppUrl(request.url) });
    return NextResponse.json(result, { status: result.submitted ? 200 : result.validation.ok ? 502 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Distribution retry failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
