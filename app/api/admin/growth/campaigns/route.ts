import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { campaignSchema } from "@/lib/growth-domain";

export async function POST(request: Request) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const actorId = "sub" in admin ? Number(admin.sub) : null;
  try {
    const body = await request.json();
    if (body.action === "spend") {
      const input = z.object({ id: z.string().uuid(), campaignId: z.number().int().positive(), amountCents: z.number().int().positive().max(100000000), spentAt: z.string().datetime(), note: z.string().min(2).max(1000) }).parse(body);
      await prisma.$transaction(async tx => {
        const existing = await tx.campaignSpend.findUnique({ where: { id: input.id } });
        if (existing) return;
        const spend = await tx.campaignSpend.create({ data: { ...input, spentAt: new Date(input.spentAt), actorId } });
        await tx.auditLog.create({ data: { actorType: "admin", actorId, action: "GROWTH_SPEND_RECORDED", entity: "campaign_spend", entityId: spend.id, metadata: input } });
      });
    } else {
      const input = campaignSchema.parse(body);
      await prisma.$transaction(async tx => {
        const campaign = await tx.marketingCampaign.create({ data: input });
        await tx.auditLog.create({ data: { actorType: "admin", actorId, action: "GROWTH_CAMPAIGN_CREATED", entity: "marketing_campaign", entityId: String(campaign.id), metadata: input } });
      });
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not save. Check the fields and use a unique campaign slug." }, { status: 400 }); }
}
