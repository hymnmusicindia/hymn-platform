import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { handoffStudioOrderToRelease } from "@/lib/studio-services";
const schema = z.object({ finalStudioFileId: z.number().int().positive() });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { const auth = await requireUser(); if ("error" in auth) return auth.error; try { const body = schema.parse(await request.json()); return NextResponse.json(await handoffStudioOrderToRelease({ orderPublicId: (await context.params).id, customerId: auth.user.id, finalStudioFileId: body.finalStudioFileId }), { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start release." }, { status: 400 }); } }
