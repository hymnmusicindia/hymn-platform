import { cronHandler } from "@/lib/cron/runtime";
import { timingSafeEqual } from "node:crypto";
import { processSupportMail } from "@/lib/support";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = cronHandler("support-mail", async request => {
  const expected=Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`),actual=Buffer.from(request.headers.get("authorization")||"");
  if(!process.env.CRON_SECRET||expected.length!==actual.length||!timingSafeEqual(expected,actual))return Response.json({error:"Unauthorized."},{status:401});
  try{return Response.json(await processSupportMail());}catch{return Response.json({error:"Support mail queue unavailable."},{status:503});}
});
