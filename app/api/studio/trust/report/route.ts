import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
 const auth = await requireUser(); if ("error" in auth) return auth.error;
 try {
  const data = z.object({ targetType: z.enum(["VOUCH", "CLIENT", "CREDIT"]), targetId: z.number().int().positive(), reason: z.string().trim().min(10).max(1000) }).parse(await request.json());
  const exists = data.targetType === "VOUCH" ? await prisma.studioVouch.count({ where: { id: data.targetId, status: "APPROVED" } }) : data.targetType === "CLIENT" ? await prisma.studioReview.count({ where: { id: data.targetId, status: "PUBLISHED" } }) : await prisma.studioShowcase.count({ where: { id: data.targetId, status: "APPROVED" } });
  if (!exists) return NextResponse.json({ error: "Published record not found." }, { status: 404 });
  const report = await prisma.studioTrustReport.upsert({ where: { reporterId_targetType_targetId: { reporterId: auth.user.id, targetType: data.targetType, targetId: data.targetId } }, create: { reporterId: auth.user.id, ...data }, update: {} });
  return NextResponse.json({ success: true, id: report.id });
 } catch { return NextResponse.json({ error: "Describe the issue in at least ten characters." }, { status: 400 }); }
}
