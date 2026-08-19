import { NextResponse } from "next/server";
import { requireAdminPermission, requireRecentAdminPermission } from "@/lib/access";
import { listAdminPayoutRequests, updatePayoutRequestStatus } from "@/lib/payout";

export const runtime = "nodejs";

function parseStatus(value: unknown) {
  if (["under_review", "approved", "processing", "paid", "failed", "rejected", "cancelled"].includes(String(value))) return value as "under_review" | "approved" | "processing" | "paid" | "failed" | "rejected" | "cancelled";
  return null;
}

export async function GET() {
  const admin = await requireAdminPermission("payouts.review");
  if (typeof admin === "object" && "error" in admin) return admin.error;

  const requests = await listAdminPayoutRequests();
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const requestId = Number(body.requestId);
  const status = parseStatus(body.status);

  if (!Number.isInteger(requestId) || requestId <= 0 || !status) {
    return NextResponse.json({ error: "Valid requestId and status are required." }, { status: 400 });
  }
  const admin = status === "paid" ? await requireRecentAdminPermission("payouts.mark_paid") : await requireAdminPermission(status === "approved" ? "payouts.approve" : "payouts.review");
  if (typeof admin === "object" && "error" in admin) return admin.error;

  try {
    const updated = await updatePayoutRequestStatus({
      requestId,
      status,
      adminNote: typeof body.adminNote === "string" ? body.adminNote : null
      ,actorId: "sub" in admin ? admin.sub : null,
      paymentReference: typeof body.paymentReference === "string" ? body.paymentReference : undefined,
      paymentMethod: typeof body.paymentMethod === "string" ? body.paymentMethod : undefined,
      paymentDate: body.paymentDate ? new Date(String(body.paymentDate)) : undefined,
      paidAmount: body.paidAmount === undefined ? undefined : Number(body.paidAmount)
    });
    return NextResponse.json({ request: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update payout request." }, { status: 400 });
  }
}

// vercel trigger 2
// vercel trigger 9
