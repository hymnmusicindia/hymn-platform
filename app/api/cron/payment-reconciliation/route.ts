import { cronHandler } from "@/lib/cron/runtime";
export const GET = cronHandler("payment-reconciliation", runJob);
import { NextResponse } from "next/server";
import { reconcilePayments } from "@/lib/payment-reconciliation";
async function runJob(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await reconcilePayments());
}
