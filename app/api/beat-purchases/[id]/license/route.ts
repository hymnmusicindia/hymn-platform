import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const purchase = await prisma.beatPurchase.findUnique({ where: { id: Number((await params).id) } });
  if (!purchase || (purchase.userId !== user.user.id && user.user.role !== "admin")) return NextResponse.json({ error: "Purchase not found." }, { status: 404 });
  if (!purchase.hasAccess) return NextResponse.json({ error: "License access has been revoked." }, { status: 403 });
  if (!purchase.licenseUrl) return NextResponse.json({ error: "License is still processing." }, { status: 409 });
  const target = new URL(purchase.licenseUrl, _request.url);
  if (target.origin !== new URL(_request.url).origin || !target.pathname.startsWith("/api/assets/")) return NextResponse.json({ error: "Legacy public licence access is disabled; regenerate this licence." }, { status: 409 });
  return NextResponse.redirect(target);
}
// vercel trigger 9
