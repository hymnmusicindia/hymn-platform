import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { generatePayoutWorkbook, recordReportFailure } from "@/lib/payout/reports";
export const runtime="nodejs";
export async function GET(){const auth=await requireUser();if("error"in auth)return auth.error;const reports=await (prisma as any).payoutReport.findMany({where:{userId:auth.user.id},orderBy:{generatedAt:"desc"},take:50});return NextResponse.json({reports});}
export async function POST(request:Request){const auth=await requireUser();if("error"in auth)return auth.error;const body=await request.json().catch(()=>({}));const isMonthly=body.type==="monthly";const input={type:(isMonthly?"monthly":"user_statement") as "monthly"|"user_statement",month:isMonthly?Number(body.month):undefined,quarter:!isMonthly?Number(body.quarter):undefined,year:Number(body.year),userId:auth.user.id};try{const report=await generatePayoutWorkbook(input);return NextResponse.json({report:{id:report.id,fileName:report.fileName,status:report.status,generatedAt:report.generatedAt}});}catch(error){await recordReportFailure(input,error).catch(()=>null);return NextResponse.json({error:error instanceof Error?error.message:"Statement generation failed."},{status:400});}}
