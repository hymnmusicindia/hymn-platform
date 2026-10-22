import { cronHandler } from "@/lib/cron/runtime";
import { timingSafeEqual } from "node:crypto";
import { processTeamOutreachEmail } from "@/lib/team/outreach-email";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = cronHandler("team-outreach", async request => {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`), actual = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try { return Response.json({ outreach: await processTeamOutreachEmail() }); }
  catch { return Response.json({ error: "Outreach queue unavailable; retry next minute." }, { status: 503 }); }
});
