import { NextResponse } from "next/server";
import { receiveRazorpayEvent, processRazorpayEvent } from "@/lib/payment-webhooks";
import { verifyRazorpayWebhookSignature } from "@/lib/razorpay";

export async function POST(request: Request) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(rawBody.toString("utf8")); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const event = await receiveRazorpayEvent(rawBody, payload as never);
  if (event.processingState === "processed") return NextResponse.json({ received: true, duplicate: true });
  try { await processRazorpayEvent(event.id); return NextResponse.json({ received: true }); }
  catch { return NextResponse.json({ received: true, retryRequired: true }, { status: 500 }); }
}
// vercel trigger 9
