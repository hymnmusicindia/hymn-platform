import { NextResponse } from "next/server";
import { closeQuarter, ensurePayoutPeriod, getCurrentQuarter, getPreviousQuarter } from "@/lib/payout/quarters";
export const runtime="nodejs";
export async function POST(request:Request){const secret=process.env.CRON_SECRET;if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized."},{status:401});try{const now=new Date();const current=getCurrentQuarter(now);await ensurePayoutPeriod("quarterly",current.year,current.quarter);if(now.getUTCMonth()%3!==0||now.getUTCDate()!==1)return NextResponse.json({ok:true,action:"none",current});const previous=getPreviousQuarter(now);const closed=await closeQuarter(previous.quarter,previous.year);return NextResponse.json({ok:true,action:"closed",period:closed});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Quarter close failed."},{status:409});}}
export const GET=POST;
