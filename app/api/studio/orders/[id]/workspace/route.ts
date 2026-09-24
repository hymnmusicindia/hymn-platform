import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getStudioWorkspace } from "@/lib/studio-services";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) { const auth = await requireUser(); if ("error" in auth) return auth.error; try { return NextResponse.json({ workspace: await getStudioWorkspace((await context.params).id, auth.user.id) }, { headers: { "Cache-Control": "private, no-store" } }); } catch { return NextResponse.json({ error: "Studio order not found." }, { status: 404 }); } }
