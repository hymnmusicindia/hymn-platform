import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { createStudioDelivery } from "@/lib/studio-services";
import { sendStudioEmail } from "@/lib/studio-email";
const schema = z.object({ studioFileIds: z.array(z.number().int().positive()).min(1).max(12), note: z.string().trim().max(2000).optional(), idempotencyKey: z.string().trim().min(8).max(160) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const auth = await requireUser(); if ("error" in auth) return auth.error; try { const id=(await context.params).id; const delivery=await createStudioDelivery({ orderPublicId:id, engineerUserId: auth.user.id, ...schema.parse(await request.json()) }); await sendStudioEmail(id,"delivery",String(delivery.id)).catch(()=>undefined); return NextResponse.json({ delivery }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create delivery." }, { status: 400 }); } }
