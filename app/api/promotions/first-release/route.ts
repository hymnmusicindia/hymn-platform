import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getFirstReleaseEligibility, trackFirstReleaseEvent } from "@/lib/first-release-promotion";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false, eligible: false, reason: "authentication_required" });
  return NextResponse.json({ authenticated: true, ...(await getFirstReleaseEligibility(session.sub)) });
}

export async function POST(request: Request) {
  const session = await getSession();
  const body = await request.json().catch(() => ({}));
  const allowedEvents = new Set(["landing_view", "release_for_free_clicked", "login_started", "login_completed", "release_started", "audio_uploaded", "artwork_uploaded", "metadata_completed", "review_reached", "promotion_redeemed", "release_submitted", "dashboard_entered"]);
  const event = String(body.event || "");
  if (!allowedEvents.has(event)) return NextResponse.json({ error: "Unsupported event." }, { status: 400 });
  const attribution = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].map((key) => [key, typeof body.attribution?.[key] === "string" ? body.attribution[key].slice(0, 200) : undefined]).filter(([, value]) => value));
  await trackFirstReleaseEvent({ event, userId: session?.sub, anonymousId: typeof body.anonymousId === "string" ? body.anonymousId.slice(0, 100) : undefined, attribution, metadata: typeof body.metadata === "object" ? body.metadata : undefined });
  return NextResponse.json({ success: true });
}
