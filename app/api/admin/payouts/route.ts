import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listAdminPayoutRequests, updatePayoutRequestStatus } from "@/lib/payout";

export const runtime = "nodejs";

function parseStatus(value: unknown) {
  if (value === "approved" || value === "processing" || value === "paid" || value === "rejected") return value;
  return null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (typeof admin === "object" && "error" in admin) return admin.error;

  const requests = await listAdminPayoutRequests();
  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (typeof admin === "object" && "error" in admin) return admin.error;

  const body = await request.json().catch(() => ({}));
  const requestId = Number(body.requestId);
  const status = parseStatus(body.status);

  if (!Number.isInteger(requestId) || requestId <= 0 || !status) {
    return NextResponse.json({ error: "Valid requestId and status are required." }, { status: 400 });
  }

  try {
    const updated = await updatePayoutRequestStatus({
      requestId,
      status,
      adminNote: typeof body.adminNote === "string" ? body.adminNote : null
      ,actorId: "sub" in admin ? admin.sub : null
    });
    return NextResponse.json({ request: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update payout request." }, { status: 400 });
  }
}

// vercel trigger 2
