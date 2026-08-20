import { NextResponse } from "next/server";
import { getLatestUsdInrRate, refreshUsdInrRate } from "@/lib/payout/exchange-rates";
import { PAYOUT_CONFIG } from "@/lib/payout/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const latest = await getLatestUsdInrRate();
    const due = !latest || Date.now() - latest.fetchedAt.getTime() >= PAYOUT_CONFIG.exchangeRateRefreshHours * 3_600_000;
    if (!due) return NextResponse.json({ ok: true, action: "not_due", fetchedAt: latest.fetchedAt });
    return NextResponse.json({ ok: true, action: "refreshed", exchangeRate: await refreshUsdInrRate({ type: "cron" }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Exchange-rate refresh failed." }, { status: 503 });
  }
}


// vercel trigger 12
