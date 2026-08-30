import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const message = String((await request.json().catch(() => ({}))).message || "").trim();
  if (message.length < 10 || message.length > 2000) return NextResponse.json({ error: "Appeal must be between 10 and 2,000 characters." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { status: true } });
  if (!user || !["PAUSED", "UNDER_REVIEW", "SUSPENDED", "DELETION_SCHEDULED"].includes(user.status)) return NextResponse.json({ error: "This account does not currently require an appeal." }, { status: 409 });
  await prisma.user.update({ where: { id: auth.user.id }, data: { appealRequestedAt: new Date(), appealMessage: message, status: "UNDER_REVIEW" } });
  await prisma.auditLog.create({ data: { actorId: auth.user.id, actorRole: auth.user.role, action: "ACCOUNT_APPEAL_SUBMITTED", entity: "user", entityId: String(auth.user.id), metadata: { priorStatus: user.status } } });
  return NextResponse.json({ success: true, status: "under_review" });
}
