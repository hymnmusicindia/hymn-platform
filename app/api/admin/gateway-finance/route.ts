import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission, requireRecentAdminPermission } from "@/lib/access";
import { settlementWorkspace, syncSettlementMonth } from "@/lib/gateway-settlements";
import { cancelRouteReservation, linkRouteAccount, refreshRouteTransfer, releaseRouteTransfer, reserveRouteEarning, routeWorkspace, submitRouteTransfer } from "@/lib/razorpay-route";

export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync"), month: z.string() }),
  z.object({ action: z.literal("link"), userId: z.number().int().positive(), accountId: z.string().regex(/^acc_[A-Za-z0-9]+$/), productId: z.string().regex(/^acc_prd_[A-Za-z0-9]+$/) }),
  z.object({ action: z.literal("reserve"), sourceKey: z.string().regex(/^(beat|studio):[1-9]\d*$/) }),
  z.object({ action: z.literal("submit"), id: z.number().int().positive() }),
  z.object({ action: z.literal("refresh"), id: z.number().int().positive() }),
  z.object({ action: z.literal("release"), id: z.number().int().positive() }),
  z.object({ action: z.literal("cancel"), id: z.number().int().positive() }),
]);
export async function GET(request: Request) {
  const admin = await requireAdminPermission("payouts.review"); if ("error" in admin) return admin.error;
  try {
    const url = new URL(request.url);
    return NextResponse.json(url.searchParams.get("view") === "route" ? await routeWorkspace() : await settlementWorkspace(url.searchParams.get("month") || new Date().toISOString().slice(0, 7)));
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Financial records unavailable." }, { status: 503 }); }
}
export async function POST(request: Request) {
  // Session cookies cannot authorise a cross-origin financial action.
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid financial action." }, { status: 400 });
  const body = parsed.data;
  const admin = ["sync", "refresh"].includes(body.action) ? await requireAdminPermission("payouts.review") : await requireRecentAdminPermission("payouts.approve");
  if ("error" in admin) return admin.error;
  const actorId = "sub" in admin ? Number(admin.sub) : null;
  try {
    switch (body.action) {
      case "sync": await syncSettlementMonth(body.month); break;
      case "link": await linkRouteAccount(body.userId, body.accountId, body.productId, actorId); break;
      case "reserve": await reserveRouteEarning(body.sourceKey, actorId); break;
      case "submit": await submitRouteTransfer(body.id, actorId); break;
      case "release": await releaseRouteTransfer(body.id, actorId); break;
      case "refresh": await refreshRouteTransfer(body.id); break;
      case "cancel": await cancelRouteReservation(body.id, actorId); break;
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Financial action failed." }, { status: 400 }); }
}
