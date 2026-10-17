import { cronHandler } from "@/lib/cron/runtime";
export const GET = cronHandler("referral-reconciliation", runJob);
import { deliverReferralMail } from "@/lib/referral-mail";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reconcileReferralQualifications } from "@/lib/referral-reconciliation";
export const maxDuration = 60;
async function runJob(request: Request) {
  const expected=Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual=Buffer.from(request.headers.get("authorization") || "");
  if(!process.env.CRON_SECRET || expected.length!==actual.length || !timingSafeEqual(expected,actual)) return NextResponse.json({error:"Unauthorized."},{status:401});
  try {
    const deadline = Date.now() + 45000;
    const [result, mail] = await Promise.allSettled([reconcileReferralQualifications(Date.now() + 20000), deliverReferralMail(deadline)]);
    if (result.status === "rejected" || mail.status === "rejected") return NextResponse.json({ error: "Some referral work needs a retry. Completed work is safe to replay." }, { status: 503 });
    return NextResponse.json({ ...result.value, mail: mail.value });
  }
  catch { return NextResponse.json({error:"Referral reconciliation failed; safe to retry."},{status:503}); }
}
