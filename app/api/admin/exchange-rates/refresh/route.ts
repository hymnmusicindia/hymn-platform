import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { refreshUsdInrRate } from "@/lib/payout/exchange-rates";

export const runtime = "nodejs";
const attempts = new Map<number, number>();

export async function POST() {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const actorId = "sub" in admin ? Number(admin.sub) || 0 : 0;
  const last = attempts.get(actorId) ?? 0;
  if (Date.now() - last < 60_000) return NextResponse.json({ error: "Please wait one minute before refreshing again." }, { status: 429 });
  attempts.set(actorId, Date.now());
  try {
    return NextResponse.json({ ok: true, exchangeRate: await refreshUsdInrRate({ type: "admin", id: actorId }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Exchange-rate refresh failed." }, { status: 503 });
  }
}

// vercel trigger 12
