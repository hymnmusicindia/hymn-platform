import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { revokeSplitInvite } from "@/lib/splits";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) { const auth = await requireUser(); if ("error" in auth) return auth.error; try { return NextResponse.json({ invite: await revokeSplitInvite(auth.user.id, Number((await params).id)) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not revoke invite." }, { status: 400 }); } }
