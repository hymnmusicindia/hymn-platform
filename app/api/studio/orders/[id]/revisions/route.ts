import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { requestStudioRevision } from "@/lib/studio-services";
import { sendStudioEmail } from "@/lib/studio-email";
const schema = z.object({ deliveryId: z.number().int().positive(), feedback: z.string().trim().min(3).max(5000), idempotencyKey: z.string().trim().min(8).max(160) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const auth = await requireUser(); if ("error" in auth) return auth.error; try { const id=(await context.params).id; const revision=await requestStudioRevision({ orderPublicId:id, customerId: auth.user.id, ...schema.parse(await request.json()) }); if(revision.included)await sendStudioEmail(id,"revision",String(revision.id)).catch(()=>undefined); return NextResponse.json({ revision }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not request revision." }, { status: 400 }); } }
