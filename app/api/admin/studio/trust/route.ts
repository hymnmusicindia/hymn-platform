import { studioError } from "@/lib/studio-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
export async function PATCH(request: Request) {
 const admin = await requireAdminPermission("services.manage"); if ("error" in admin) return admin.error;
 try {
  const { type, id, approve } = z.object({ type: z.enum(["VOUCH", "CREDIT", "REPORT"]), id: z.number().int().positive(), approve: z.boolean() }).parse(await request.json());
  await prisma.$transaction(async tx => {
   if (type === "VOUCH") { const record=await tx.studioVouch.findUniqueOrThrow({where:{id}}); if(approve && record.status!=="PENDING")throw new Error("Only pending vouches can be published."); await tx.studioVouch.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED" } }); }
   if (type === "CREDIT") { const row = await tx.studioShowcase.findUniqueOrThrow({ where: { id } }); if (approve && (row.status !== "PENDING" || !row.rightsConfirmed || !row.artistConfirmedAt)) throw new Error("Artist permission is required before publishing."); await tx.studioShowcase.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED" } }); }
   if (type === "REPORT") {
    const report = await tx.studioTrustReport.findUniqueOrThrow({ where: { id } });
    if (approve) {
     if (report.targetType === "VOUCH") await tx.studioVouch.update({ where: { id: report.targetId }, data: { status: "HIDDEN" } });
     if (report.targetType === "CREDIT") await tx.studioShowcase.update({ where: { id: report.targetId }, data: { status: "HIDDEN" } });
     if (report.targetType === "CLIENT") { const review = await tx.studioReview.update({ where: { id: report.targetId }, data: { status: "HIDDEN" }, include: { order: true } }); const aggregate = await tx.studioReview.aggregate({ where: { order: { engineerProfileId: review.order.engineerProfileId }, status: "PUBLISHED" }, _avg: { rating: true }, _count: { rating: true } }); await tx.engineerProfile.update({ where: { id: review.order.engineerProfileId }, data: { ratingAverage: aggregate._avg.rating ?? null, ratingCount: aggregate._count.rating } }); }
    }
    await tx.studioTrustReport.update({ where: { id }, data: { status: approve ? "ACTIONED" : "DISMISSED" } });
   }
   await tx.auditLog.create({ data: { actorId: "sub" in admin ? Number(admin.sub) : null, actorType: "admin", action: "STUDIO_TRUST_MODERATED", entity: type, entityId: String(id), metadata: { approve } } });
  });
  return NextResponse.json({ success: true });
 } catch(error) { return NextResponse.json({ error: studioError(error, "Could not moderate record.") }, { status: 400 }); }
}
