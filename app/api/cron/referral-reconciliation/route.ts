import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileReferralQualifications } from "@/lib/referral-reconciliation";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected=Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual=Buffer.from(request.headers.get("authorization") || "");
  if(!process.env.CRON_SECRET || expected.length!==actual.length || !timingSafeEqual(expected,actual)) return NextResponse.json({error:"Unauthorized."},{status:401});
  try { return NextResponse.json(await reconcileReferralQualifications()); }
  catch { return NextResponse.json({error:"Referral reconciliation failed; safe to retry."},{status:503}); }
}
