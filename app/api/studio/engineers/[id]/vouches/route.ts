import { studioError } from "@/lib/studio-errors";
import { NextResponse } from "next/server";
import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { createCommunityVouch } from "@/lib/studio-trust";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 const auth = await requireUser(); if ("error" in auth) return auth.error;
 try { const vouch = await createCommunityVouch(Number((await params).id), auth.user.id, await request.json()); return NextResponse.json({ success: true, id: vouch.id, status: vouch.status }, { status: 201 }); }
 catch (error) { return NextResponse.json({ error: studioError(error, "Could not submit vouch.") }, { status: 400 }); }
}
export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}) {const auth=await requireUser();if("error"in auth)return auth.error;const changed=await prisma.studioVouch.updateMany({where:{engineerProfileId:Number((await params).id),authorId:auth.user.id,status:{in:["PENDING","APPROVED"]}},data:{status:"WITHDRAWN"}});return NextResponse.json({success:Boolean(changed.count)},{status:changed.count?200:404});}
