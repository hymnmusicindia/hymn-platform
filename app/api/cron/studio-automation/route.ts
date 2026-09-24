import { NextResponse } from "next/server";
import { runStudioAutomation } from "@/lib/studio-services";
export async function POST(request:Request){const secret=process.env.CRON_SECRET?.trim();if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized."},{status:401});return NextResponse.json(await runStudioAutomation())}
