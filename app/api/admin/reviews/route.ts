import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const admin = await requireAdminPermission("services.manage");
  if ("error" in admin) return admin.error;
  const query = new URL(request.url).searchParams;
  const page = Math.max(1, Number(query.get("page")) || 1);
  const limit = 20;
  const status = query.get("status");
  const search = query.get("q")?.trim();
  const where = {
    ...(status && status !== "all" ? { status } : {}),
    ...(search ? { OR: [{ purchaseLabel: { contains: search, mode: "insensitive" as const } }, { body: { contains: search, mode: "insensitive" as const } }, { user: { is: { name: { contains: search, mode: "insensitive" as const } } } }, { user: { is: { email: { contains: search, mode: "insensitive" as const } } } }] } : {})
  };
  const [reviews, total, pending, featured] = await Promise.all([
    prisma.purchaseReview.findMany({ where, include: { user: { select: { name: true, email: true, avatar: true } }, moderatedBy: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.purchaseReview.count({ where }), prisma.purchaseReview.count({ where: { status: "pending" } }), prisma.purchaseReview.count({ where: { featured: true, status: "approved" } })
  ]);
  return NextResponse.json({ reviews, page: { current: page, pages: Math.max(1, Math.ceil(total / limit)), total }, metrics: { pending, featured } });
}
