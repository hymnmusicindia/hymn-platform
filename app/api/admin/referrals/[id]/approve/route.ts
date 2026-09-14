import { NextResponse } from "next/server";
import { requireRecentAdminPermission } from "@/lib/access";
import { approveRecurringReferral } from "@/lib/referral-reward-policy";
import { z } from "zod";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRecentAdminPermission("wallets.adjust"); if ("error" in admin) return admin.error;
  try {
    const id = z.coerce.number().int().positive().parse((await params).id);
    const { note } = z.object({ note: z.string().trim().min(5).max(1000) }).parse(await request.json());
    await approveRecurringReferral(id, "sub" in admin ? Number(admin.sub) : null, note);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Reward approval requires an eligible captured payment, a completed verification period and a clear review status." }, { status: 400 }); }
}
