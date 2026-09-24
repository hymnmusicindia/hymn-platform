import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { createStudioOrder } from "@/lib/studio-services";

const schema = z.object({ listingPublicId: z.string().uuid(), projectTitle: z.string().trim().min(1).max(160), beatPurchaseId: z.number().int().positive().optional(), idempotencyKey: z.string().trim().min(8).max(160), termsAccepted: z.literal(true) });

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const input = schema.parse(await request.json());
    const order = await createStudioOrder({ ...input, customerId: auth.user.id });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid Studio order details.", issues: error.flatten() }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create Studio order." }, { status: 409 });
  }
}
