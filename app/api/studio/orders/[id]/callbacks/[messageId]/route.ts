import { studioError } from "@/lib/studio-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { assertStudioParticipant } from "@/lib/studio-services";
import { prisma } from "@/lib/prisma";
export async function POST(request:Request,{params}:{params:Promise<{id:string;messageId:string}>}) {
 const auth=await requireUser();if("error"in auth)return auth.error;
 try{const p=await params,data=z.object({state:z.enum(["ACCEPTED","DONE"])}).parse(await request.json()),order=await assertStudioParticipant(p.id,auth.user.id);if(order.engineerParty.claimedByUserId!==auth.user.id)throw new Error("Only the assigned engineer can update callbacks.");const message=await prisma.studioMessage.findFirstOrThrow({where:{id:Number(p.messageId),orderId:order.id,kind:"CALLBACK"}});const metadata=message.metadata as {phone?:string;state?:string}|null;await prisma.studioMessage.update({where:{id:message.id},data:{metadata:{phone:metadata?.phone||"",state:data.state}}});return NextResponse.json({success:true});}catch(error){return NextResponse.json({error:studioError(error, "Could not update callback.")},{status:400});}
}
