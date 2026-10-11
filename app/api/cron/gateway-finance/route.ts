import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncSettlementMonth } from "@/lib/gateway-settlements";
import { refreshRouteTransfer } from "@/lib/razorpay-route";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const india = new Date(Date.now() + 19800000);
  const months = [india.toISOString().slice(0, 7), new Date(Date.UTC(india.getUTCFullYear(), india.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)];
  const errors: string[] = [];
  for (const month of months) try { await syncSettlementMonth(month); } catch { errors.push(`Settlement sync failed for ${month}.`); }
  const pending = await prisma.routeTransfer.findMany({ where: { status: { in: ["submitting", "review", "held", "processing"] } }, orderBy: { updatedAt: "asc" }, take: 100 });
  for (const transfer of pending) try { await refreshRouteTransfer(transfer.id); } catch { errors.push(`Route transfer #${transfer.id} needs review.`); }
  return NextResponse.json({ months, transfersChecked: pending.length, errors }, { status: errors.length ? 503 : 200 });
}
