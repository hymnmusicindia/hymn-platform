import { studioError } from "@/lib/studio-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { reviewStudioOrder } from "@/lib/studio-services";
import { VOUCH_STRENGTHS } from "@/lib/studio-trust-domain";
const schema=z.object({rating:z.number().int().min(1).max(5),strengths:z.array(z.enum(VOUCH_STRENGTHS)).max(5).optional(),comment:z.string().trim().max(2000).optional()});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const auth=await requireUser();if("error"in auth)return auth.error;try{return NextResponse.json({review:await reviewStudioOrder({orderPublicId:(await context.params).id,customerId:auth.user.id,...schema.parse(await request.json())})},{status:201})}catch(error){return NextResponse.json({error:studioError(error, "Could not publish review.")},{status:400})}}
