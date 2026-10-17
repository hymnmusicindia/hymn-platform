import { cronHandler } from "@/lib/cron/runtime";
export const GET = cronHandler("account-deletion-cleanup", runJob);
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function runJob(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const due = await prisma.user.findMany({ where: { status: "DELETION_SCHEDULED", deletionScheduledAt: { lte: new Date() }, appealRequestedAt: null }, select: { id: true }, take: 100, orderBy: { deletionScheduledAt: "asc" } });
  let anonymized = 0;
  const deadline = Date.now() + 40000;
  for (const { id } of due) {
    if (Date.now() >= deadline) break;
    const completed = await prisma.$transaction(async (tx) => {
      // Atomically recheck appeals and cancellation, not a stale candidate list.
      const claim = await tx.user.updateMany({ where: { id, status: "DELETION_SCHEDULED", deletionScheduledAt: { lte: new Date() }, appealRequestedAt: null }, data: { name: "Deleted account", email: `deleted-${id}@privacy.invalid`, googleId: `deleted-${id}`, passwordHash: null, avatar: null, mobile: null, contactEmail: null, dateOfBirth: null, status: "BANNED", statusReason: "Scheduled account deletion completed after the 20-day appeal window." } });
      if (!claim.count) return false;
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.producerProfile.updateMany({ where: { userId: id }, data: { active: false, status: "disabled", displayName: "Deleted producer", bio: "" } });
      await tx.auditLog.create({ data: { action: "ACCOUNT_SCHEDULED_DELETION_COMPLETED", entity: "user", entityId: String(id), metadata: { retainedRecords: "financial_release_licence_and_audit" } } });
      return true;
    }, { timeout: 15000 });
    if (completed) anonymized += 1;
  }
  return NextResponse.json({ success: true, anonymized });
}
