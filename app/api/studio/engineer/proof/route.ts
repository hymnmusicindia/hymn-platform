import { studioError } from "@/lib/studio-errors";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { createShowcase, createConsultationSlot } from "@/lib/studio-trust";
import { prisma } from "@/lib/prisma";
export async function POST(request: Request) {
 const auth = await requireUser(); if ("error" in auth) return auth.error;
 try { const data = await request.json(); const result = data.kind === "SLOT" ? await createConsultationSlot(auth.user.id, String(data.startsAt)) : await createShowcase(auth.user.id, data); return NextResponse.json({ success: true, id: result.id }, { status: 201 }); }
 catch(error) { return NextResponse.json({ error: studioError(error, "Could not save.") }, { status: 400 }); }
}
export async function DELETE(request:Request){const auth=await requireUser();if("error"in auth)return auth.error;const id=Number(new URL(request.url).searchParams.get("id"));if(!Number.isSafeInteger(id))return NextResponse.json({error:"Invalid showcase."},{status:400});const changed=await prisma.studioShowcase.updateMany({where:{id,engineerProfile:{contributorParty:{claimedByUserId:auth.user.id}}},data:{status:"WITHDRAWN"}});return NextResponse.json({success:Boolean(changed.count)},{status:changed.count?200:404});}
