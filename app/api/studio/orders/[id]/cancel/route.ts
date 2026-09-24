import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { cancelStudioOrder } from "@/lib/studio-services";
const schema=z.object({reason:z.string().trim().min(5).max(1000),idempotencyKey:z.string().trim().min(8).max(160)});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const auth=await requireUser();if("error"in auth)return auth.error;try{return NextResponse.json({order:await cancelStudioOrder({orderPublicId:(await context.params).id,customerId:auth.user.id,...schema.parse(await request.json())})})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not cancel order."},{status:400})}}
