import { studioError } from "@/lib/studio-errors";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { approveStudioDelivery } from "@/lib/studio-services";
import { sendStudioEmail } from "@/lib/studio-email";
const schema = z.object({ deliveryId: z.number().int().positive(), idempotencyKey: z.string().trim().min(8).max(160) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
 const auth = await requireUser(); if ("error" in auth) return auth.error;
 try {
  const id = (await context.params).id;
  const order = await approveStudioDelivery({ orderPublicId: id, customerId: auth.user.id, ...schema.parse(await request.json()) });
  if (order.status === "COMPLETED") after(() => sendStudioEmail(id, "completed", String(order.id)).catch(() => undefined));
  return NextResponse.json({ order });
 } catch (error) { return NextResponse.json({ error: studioError(error, "Could not confirm completion.") }, { status: 400 }); }
}
