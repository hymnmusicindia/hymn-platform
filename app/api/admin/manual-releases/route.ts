import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdminPermission } from "@/lib/access";
import { createManualRelease } from "@/lib/manual-releases";
import { prisma } from "@/lib/prisma";

const actorId = (admin: object) => "sub" in admin && Number.isInteger(Number(admin.sub)) ? Number(admin.sub) : null;
export async function GET(request: Request) {
  const admin = await requireAdminPermission("releases.read"); if ("error" in admin) return admin.error;
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ error: "Manual releases require a configured PostgreSQL database." }, { status: 503 });
  const url = new URL(request.url); const tab = url.searchParams.get("tab"); const search = url.searchParams.get("search")?.trim(); const status = url.searchParams.get("status");
  const where: Prisma.ReleaseWhereInput = { releaseSource: "ADMIN_MANUAL", ...(tab === "assigned" ? { ownerUserId: { not: null } } : tab === "unassigned" ? { ownerUserId: null } : {}), ...(status ? { status: status as never } : {}), ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { artistName: { contains: search, mode: "insensitive" } }, { upc: { contains: search } }, { owner: { is: { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } } }] } : {}) };
  const releases = await prisma.release.findMany({ where, include: { owner: { select: { id: true, name: true, email: true, avatar: true } }, artistProfile: { select: { id: true, artistName: true } }, tracks: { orderBy: { trackNumber: "asc" } } }, orderBy: { updatedAt: "desc" }, take: 250 });
  return NextResponse.json({ releases });
}
export async function POST(request: Request) {
  const admin = await requireAdminPermission("releases.override"); if ("error" in admin) return admin.error;
  if (!process.env.DATABASE_URL?.trim()) return NextResponse.json({ error: "Manual releases require a configured PostgreSQL database." }, { status: 503 });
  try { const body = await request.json(); const release = await createManualRelease(body.release ?? body, actorId(admin), body.action !== "draft"); return NextResponse.json({ release }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Manual release creation failed." }, { status: 400 }); }
}

// vercel trigger 15
