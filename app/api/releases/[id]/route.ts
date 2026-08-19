import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const release = await prisma.release.findFirst({ where: { id, userId: auth.user.id }, select: { id: true, status: true } });
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  if (release.status !== "DRAFT") return NextResponse.json({ error: "This release cannot be deleted after submission." }, { status: 409 });
  await prisma.release.delete({ where: { id: release.id } });
  return NextResponse.json({ success: true });
}
