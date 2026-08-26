import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const releaseId = Number(body.releaseId);
  if (!Number.isInteger(releaseId) || !body.metadataSnapshot || typeof body.metadataSnapshot !== "object") return NextResponse.json({ error: "A release and review snapshot are required." }, { status: 400 });
  const release = await prisma.release.findFirst({ where: { id: releaseId, userId: auth.user.id, status: "DRAFT" }, select: { id: true } });
  if (!release) return NextResponse.json({ error: "Draft release not found." }, { status: 404 });
  const metadataHash = crypto.createHash("sha256").update(JSON.stringify(body.metadataSnapshot)).digest("hex");
  const confirmedAt = new Date();
  await prisma.release.update({ where: { id: releaseId }, data: { reviewConfirmedAt: confirmedAt, reviewConfirmedBy: auth.user.id, reviewMetadataHash: metadataHash } });
  return NextResponse.json({ confirmedAt: confirmedAt.toISOString(), metadataHash });
}
