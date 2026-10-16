import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { publicWebUrl } from "@/lib/studio-trust";
import { ownEngineer } from "@/lib/studio-trust";
import { prisma } from "@/lib/prisma";
import { studioError } from "@/lib/studio-errors";
export async function PATCH(request:Request){const auth=await requireUser();if("error"in auth)return auth.error;try{const data=z.object({availability:z.enum(["AVAILABLE","UNAVAILABLE"]),maxActiveOrders:z.number().int().min(1).max(20),introVideoUrl:publicWebUrl.or(z.literal("")).optional()}).parse(await request.json()),profile=await ownEngineer(auth.user.id);const {introVideoUrl,...settings}=data;const portfolio=profile.portfolio&&typeof profile.portfolio==="object"&&!Array.isArray(profile.portfolio)?profile.portfolio:{};await prisma.engineerProfile.update({where:{id:profile.id},data:{...settings,...(introVideoUrl!==undefined?{portfolio:{...portfolio,introVideoUrl}}:{})}});return NextResponse.json({success:true});}catch(error){return NextResponse.json({error:studioError(error)},{status:400});}}
