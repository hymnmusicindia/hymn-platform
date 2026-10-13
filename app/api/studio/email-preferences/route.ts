import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { studioPreferenceUser } from "@/lib/studio-beat-followups";
export async function POST(request:Request){const body=await request.json().catch(()=>null),id=typeof body?.token==="string"?studioPreferenceUser(body.token):null;if(!id)return NextResponse.json({error:"This preference link is invalid or expired."},{status:400});await prisma.user.update({where:{id},data:{studioTipsEnabled:false}});return NextResponse.json({success:true});}
