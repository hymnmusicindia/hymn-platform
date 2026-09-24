import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { sendStudioMessage } from "@/lib/studio-services";
const schema = z.object({ body: z.string().trim().min(1).max(5000), idempotencyKey: z.string().trim().min(8).max(160) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const auth = await requireUser(); if ("error" in auth) return auth.error; try { const body = schema.parse(await request.json()); return NextResponse.json({ message: await sendStudioMessage({ orderPublicId: (await context.params).id, userId: auth.user.id, ...body }) }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send message." }, { status: 400 }); } }
