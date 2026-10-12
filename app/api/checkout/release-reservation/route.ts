import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { releaseCheckoutReservation } from "@/lib/checkout-reservations";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { orderId } = await request.json();
    if (typeof orderId !== "string" || !/^order_[a-zA-Z0-9]+$/.test(orderId)) return NextResponse.json({ error: "Invalid checkout." }, { status: 400 });
    return NextResponse.json(await releaseCheckoutReservation(session.sub, orderId));
  } catch {
    return NextResponse.json({ error: "Could not release checkout. Any existing reservation remains protected until expiry." }, { status: 503 });
  }
}
