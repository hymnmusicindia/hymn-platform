import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { manageProviderSubscription } from "@/lib/subscription-billing";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await request.json();
    const action = String(body.action || "") as "cancel_now" | "cancel_period_end" | "pause" | "resume";
    if (!["cancel_now", "cancel_period_end", "pause", "resume"].includes(action)) return NextResponse.json({ error: "Invalid subscription action." }, { status: 400 });
    return NextResponse.json({ subscription: await manageProviderSubscription(session.sub, action) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Subscription action failed." }, { status: 400 });
  }
}
