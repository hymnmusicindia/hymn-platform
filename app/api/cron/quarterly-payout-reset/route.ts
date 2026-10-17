import { cronHandler } from "@/lib/cron/runtime";
export const POST = cronHandler("quarterly-payout-reset", runJob);
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { closeQuarter, ensurePayoutPeriod, getCurrentQuarter, getPreviousQuarter } from "@/lib/payout/quarters";
export const runtime="nodejs";
async function runJob(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const current = getCurrentQuarter();
    await ensurePayoutPeriod("quarterly", current.year, current.quarter);
    const previous = getPreviousQuarter();
    const period = await prisma.payoutPeriod.findFirst({ where: { type: "quarterly", quarter: previous.quarter, year: previous.year } });
    // A missed first-day trigger must not leave an existing prior period open
    // forever. Never manufacture history or force unresolved rows closed.
    if (!period || ["closed", "locked"].includes(period.status)) return NextResponse.json({ ok: true, action: "none", current });
    const closed = await closeQuarter(previous.quarter, previous.year);
    return NextResponse.json({ ok: true, action: "closed", period: closed });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Quarter close failed." }, { status: 409 }); }
}
export const GET=POST;
