import { cronHandler } from "@/lib/cron/runtime";
export const GET = cronHandler("draft-reminders", runJob);
import { timingSafeEqual } from "node:crypto";
import { runDraftLifecycle } from "@/lib/draft-lifecycle";
export const runtime = "nodejs";
async function runJob(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try { return Response.json(await runDraftLifecycle({ apply: true }), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Draft reminders could not complete. Check email delivery logs." }, { status: 503 }); }
}
