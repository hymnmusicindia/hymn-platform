import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("services.manage");
  if ("error" in admin) return admin.error;
  const id = Number((await context.params).id);
  const body = await request.json().catch(() => null);
  const status = ["pending", "approved", "rejected"].includes(body?.status) ? String(body.status) : undefined;
  const featured = typeof body?.featured === "boolean" ? body.featured : undefined;
  const featuredOrder = Number.isInteger(body?.featuredOrder) ? Math.max(0, Math.min(999, body.featuredOrder)) : undefined;
  if (!Number.isInteger(id) || (!status && featured === undefined && featuredOrder === undefined)) return NextResponse.json({ error: "Invalid moderation update." }, { status: 400 });
  const current = await prisma.purchaseReview.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Review not found." }, { status: 404 });
  const nextStatus = status ?? current.status;
  const nextFeatured = nextStatus === "approved" && Boolean(current.body) ? (featured ?? current.featured) : false;
  if (featured === true && (!current.body || nextStatus !== "approved")) return NextResponse.json({ error: "Approve a written review before featuring it." }, { status: 400 });
  const actorId = "sub" in admin ? Number(admin.sub) || null : null;
  const review = await prisma.$transaction(async (tx) => {
    const updated = await tx.purchaseReview.update({ where: { id }, data: { ...(status ? { status } : {}), featured: nextFeatured, ...(featuredOrder !== undefined ? { featuredOrder } : {}), moderatedById: actorId, moderatedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId, actorRole: "admin", action: "PURCHASE_REVIEW_MODERATED", entity: "purchase_review", entityId: String(id), previousValue: { status: current.status, featured: current.featured }, newValue: { status: updated.status, featured: updated.featured, featuredOrder: updated.featuredOrder }, reason: "Review moderation update" } });
    return updated;
  });
  revalidateTag("public-home-preview", "max");
  return NextResponse.json({ review });
}
