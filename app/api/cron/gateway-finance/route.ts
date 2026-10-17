import { cronHandler } from "@/lib/cron/runtime";
export const GET = cronHandler("gateway-finance", runJob);
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSettlementMonth } from "@/lib/gateway-settlements";
import { refreshRouteTransfer } from "@/lib/razorpay-route";
export const runtime = "nodejs";
export const maxDuration = 300;
async function runJob(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const india = new Date(Date.now() + 19800000);
  const months = [india.toISOString().slice(0, 7), new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)];
  const errors: string[] = [];
  const deadline = Date.now() + 40000;
  for (const month of months) try { await syncSettlementMonth(month); } catch { errors.push(`Settlement sync failed for ${month}.`); }
  const pending = await prisma.routeTransfer.findMany({ where: { status: { in: ["submitting", "review", "held", "processing"] } }, orderBy: { updatedAt: "asc" }, take: 100 });
  let transfersChecked = 0;
  for (const transfer of pending) {
    if (Date.now() >= deadline) break;
    try { await refreshRouteTransfer(transfer.id); } catch { errors.push(`Route transfer #${transfer.id} needs review.`); }
    transfersChecked++;
  }
  return NextResponse.json({ months, transfersChecked, deferred: pending.length - transfersChecked, errors }, { status: errors.length ? 503 : 200 });
}
