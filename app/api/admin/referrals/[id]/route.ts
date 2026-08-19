import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("fraud.read"); if ("error" in admin) return admin.error;
  const id = Number((await params).id); if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid referral." }, { status: 400 });
  const referral = await prisma.referral.findUnique({ where: { id }, include: { owner: { select: { id: true, name: true, email: true } }, referredUser: { select: { id: true, name: true, email: true } } } });
  if (!referral) return NextResponse.json({ error: "Referral not found." }, { status: 404 });
  const [ledger, alerts, notifications, audit] = await Promise.all([
    prisma.creditLedgerEntry.findMany({ where: { sourceType: "referral", sourceId: String(id) }, orderBy: { createdAt: "asc" } }),
    prisma.fraudAlert.findMany({ where: { entityType: "referral", entityId: String(id) }, orderBy: { detectedAt: "desc" } }),
    prisma.notification.findMany({ where: { eventKey: { startsWith: `referral:${id}:` } }, orderBy: { createdAt: "asc" } }),
    prisma.auditLog.findMany({ where: { entity: "referral", entityId: String(id) }, orderBy: { createdAt: "asc" } })
  ]);
  return NextResponse.json({ referral, ledger, alerts, notifications, audit });
}
