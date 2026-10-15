import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { playlistReviewSnapshot, moderateCuratorListing, decideReview, resolveReviewConcern, recordCuratorSettlement } from "@/lib/playlist-reviews";
import { z } from "zod";
export async function GET() {
  const admin = await requireAdminPermission("services.manage"); if ("error" in admin) return admin.error;
  return NextResponse.json(await playlistReviewSnapshot(("sub" in admin ? Number(admin.sub) : 0), true));
}
export async function POST(request: Request) {
  const admin = await requireAdminPermission("services.manage"); if ("error" in admin) return admin.error;
  if (request.headers.get("origin") !== new URL(getPublicAppUrl()).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.json(); const id = z.number().int().positive().parse(body.id);
    if (body.action === "moderate") return NextResponse.json({ listing: await moderateCuratorListing(("sub" in admin ? Number(admin.sub) : null), id, z.enum(["APPROVED", "DECLINED", "PAUSED"]).parse(body.status), z.string().max(2000).parse(body.note)) });
    if (body.action === "decide") return NextResponse.json({ review: await decideReview(("sub" in admin ? Number(admin.sub) : null), id, body, true) });
    if (body.action === "resolve") return NextResponse.json({ review: await resolveReviewConcern(("sub" in admin ? Number(admin.sub) : null), id, z.enum(["REFUND", "UPHOLD"]).parse(body.resolution), z.string().max(2000).parse(body.note)) });
    if (body.action === "settle") { const payoutAdmin = await requireAdminPermission("payouts.mark_paid"); if ("error" in payoutAdmin) return payoutAdmin.error; return NextResponse.json({ review: await recordCuratorSettlement(("sub" in admin ? Number(admin.sub) : null), id, z.string().parse(body.reference), z.coerce.number().positive().parse(body.paidAmount)) }); }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update the review." }, { status: 400 }); }
}
