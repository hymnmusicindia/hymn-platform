import { NextResponse } from "next/server";
import { runStudioAutomation } from "@/lib/studio-services";
import { sendStudioBeatFollowups } from "@/lib/studio-beat-followups";
export const maxDuration=60;
export async function POST(request:Request){const secret=process.env.CRON_SECRET?.trim();if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized."},{status:401});const deadline=Date.now()+45000;return NextResponse.json({automation:await runStudioAutomation(),followups:await sendStudioBeatFollowups(new Date(),deadline)})}
export const GET=POST;
