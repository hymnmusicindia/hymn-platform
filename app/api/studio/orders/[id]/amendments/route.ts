import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { proposeStudioAmendment } from "@/lib/studio-services";
const schema=z.object({description:z.string().trim().min(5).max(2000),amount:z.number().positive().max(100000)});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const auth=await requireUser();if("error"in auth)return auth.error;try{return NextResponse.json({amendment:await proposeStudioAmendment({orderPublicId:(await context.params).id,engineerUserId:auth.user.id,...schema.parse(await request.json())})},{status:201})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not propose amendment."},{status:400})}}
