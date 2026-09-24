import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { createStudioPayment } from "@/lib/studio-services";

const schema = z.object({ idempotencyKey: z.string().trim().min(8).max(160) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  try {
    const { idempotencyKey } = schema.parse(await request.json());
    const payment = await createStudioPayment({ orderPublicId: (await context.params).id, customerId: auth.user.id, idempotencyKey });
    return NextResponse.json({ orderId: payment.razorpayOrderId, amount: Number(payment.amount) * 100, currency: payment.currency, key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || (process.env.NODE_ENV !== "production" ? "dev_razorpay_key" : "") });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create payment." }, { status: 400 }); }
}
