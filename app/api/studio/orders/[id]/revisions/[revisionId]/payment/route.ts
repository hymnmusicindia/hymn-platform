import { studioError } from "@/lib/studio-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { createStudioRevisionPayment } from "@/lib/studio-services";
const schema = z.object({ idempotencyKey: z.string().trim().min(8).max(160) });
export async function POST(request: Request, context: { params: Promise<{ id: string; revisionId: string }> }) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  try { const params = await context.params; const payment = await createStudioRevisionPayment({ orderPublicId: params.id, revisionId: Number(params.revisionId), customerId: auth.user.id, ...schema.parse(await request.json()) }); return NextResponse.json({ orderId: payment.razorpayOrderId, amount: Number(payment.amount) * 100, currency: payment.currency, key: process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || (process.env.NODE_ENV !== "production" ? "dev_razorpay_key" : "") }); }
  catch (error) { return NextResponse.json({ error: studioError(error, "Could not create revision payment.") }, { status: 400 }); }
}
