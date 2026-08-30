import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const due = await prisma.user.findMany({ where: { status: "DELETION_SCHEDULED", deletionScheduledAt: { lte: new Date() }, appealRequestedAt: null }, select: { id: true } });
  let anonymized = 0;
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.producerProfile.updateMany({ where: { userId: id }, data: { active: false, status: "disabled", displayName: "Deleted producer", bio: "" } });
      await tx.user.update({ where: { id }, data: { name: "Deleted account", email: `deleted-${id}@privacy.invalid`, googleId: `deleted-${id}`, passwordHash: null, avatar: null, mobile: null, contactEmail: null, dateOfBirth: null, status: "BANNED", statusReason: "Scheduled account deletion completed after the 20-day appeal window." } });
      await tx.auditLog.create({ data: { action: "ACCOUNT_SCHEDULED_DELETION_COMPLETED", entity: "user", entityId: String(id), metadata: { retainedRecords: "financial_release_licence_and_audit" } } });
    });
    anonymized += 1;
  }
  return NextResponse.json({ success: true, anonymized });
}
