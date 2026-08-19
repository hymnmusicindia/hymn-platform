import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { processRazorpayEvent } from "@/lib/payment-webhooks";
import { logAuditEvent } from "@/lib/audit-log";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid event ID." }, { status: 400 });
  try {
    const event = await processRazorpayEvent(id);
    await logAuditEvent({ actorType: "admin", actorId: "sub" in admin ? Number(admin.sub) || null : null, action: "RAZORPAY_WEBHOOK_REPLAY", entityType: "payment_webhook_event", entityId: id, metadata: { processingState: event.processingState } });
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Replay failed." }, { status: 400 });
  }
}
// vercel trigger 9
