import { NextResponse } from "next/server";
import { requireRecentAdminPermission } from "@/lib/access";
import { transferManualRelease } from "@/lib/manual-releases";
const actorId = (admin: object) => "sub" in admin && Number.isInteger(Number(admin.sub)) ? Number(admin.sub) : null;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { const admin = await requireRecentAdminPermission("releases.override"); if ("error" in admin) return admin.error; try { const body = await request.json(); const release = await transferManualRelease(Number((await params).id), Number(body.newOwnerUserId), String(body.reason ?? ""), actorId(admin)); return NextResponse.json({ release }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Transfer failed." }, { status: 400 }); } }
