import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getFirstReleaseEligibility, trackFirstReleaseEvent } from "@/lib/first-release-promotion";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false, eligible: false, reason: "authentication_required" });
  return NextResponse.json({ authenticated: true, ...(await getFirstReleaseEligibility(session.sub)) });
}

export async function POST(request: Request) {
  const rate = await consumeRateLimit({ scope: "first-release.events", identity: requestIdentity(request), limit: 90, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  const session = await getSession();
  const body = await request.json().catch(() => ({}));
  const allowedEvents = new Set(["landing_view", "release_for_free_clicked", "login_started", "audio_uploaded", "artwork_uploaded", "metadata_completed", "review_reached", "dashboard_entered"]);
  const event = String(body.event || "");
  if (!allowedEvents.has(event)) return NextResponse.json({ error: "Unsupported event." }, { status: 400 });
  const attribution = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].map((key) => [key, typeof body.attribution?.[key] === "string" ? body.attribution[key].slice(0, 200) : undefined]).filter(([, value]) => value));
  await trackFirstReleaseEvent({ event: `client_${event}`, userId: session?.sub, attribution, metadata: { source: "client" } }).catch(() => undefined);
  return NextResponse.json({ success: true });
}
