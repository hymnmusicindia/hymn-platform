import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { reviewStudioOrder } from "@/lib/studio-services";
const schema=z.object({rating:z.number().int().min(1).max(5),comment:z.string().trim().max(2000).optional()});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const auth=await requireUser();if("error"in auth)return auth.error;try{return NextResponse.json({review:await reviewStudioOrder({orderPublicId:(await context.params).id,customerId:auth.user.id,...schema.parse(await request.json())})},{status:201})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not publish review."},{status:400})}}
