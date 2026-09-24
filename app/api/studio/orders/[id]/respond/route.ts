import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { respondToStudioOrder } from "@/lib/studio-services";
import { sendStudioEmail } from "@/lib/studio-email";

const schema = z.object({ accept: z.boolean() });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  try { const body = schema.parse(await request.json()); const id=(await context.params).id; const order=await respondToStudioOrder({ orderPublicId: id, engineerUserId: auth.user.id, accept: body.accept }); await sendStudioEmail(id,body.accept?"accepted":"declined",String(order.updatedAt.getTime())).catch(()=>undefined); return NextResponse.json({ order }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Studio request." }, { status: 400 }); }
}
