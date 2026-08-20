import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const schema = z.object({ reason: z.string().trim().min(10).max(500), confirm: z.literal(true) });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("fraud.manage"); if ("error" in admin) return admin.error;
  const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Confirmation and reason are required." }, { status: 400 });
  const id = Number((await params).id); const actorId = "sub" in admin ? Number(admin.sub) || null : null;
  const referral = await prisma.$transaction(async tx => {
    const current = await tx.referral.findUnique({ where: { id } }); if (!current) throw new Error("Referral not found.");
    if (current.status === "REWARDED") throw new Error("Reverse a rewarded referral instead of invalidating it.");
    const updated = await tx.referral.update({ where: { id }, data: { status: "REJECTED", rejectionReason: parsed.data.reason, riskStatus: "reviewed" } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId, actorRole: "admin", action: "REFERRAL_INVALIDATED", entity: "referral", entityId: String(id), reason: parsed.data.reason, riskLevel: "high" } }); return updated;
  });
  return NextResponse.json({ referral });
}
