import { studioError } from "@/lib/studio-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { confirmShowcase } from "@/lib/studio-trust";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 const auth = await requireUser(); if ("error" in auth) return auth.error;
 try { const data = z.object({ approve: z.boolean() }).parse(await request.json()); await confirmShowcase(Number((await params).id), auth.user.id, data.approve); return NextResponse.json({ success: true }); }
 catch(error) { return NextResponse.json({ error: studioError(error, "Could not confirm credit.") }, { status: 400 }); }
}
