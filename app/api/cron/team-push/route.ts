import { cronHandler } from "@/lib/cron/runtime";
import { dispatchTeamPush } from "@/lib/team/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function runJob() {
  try { return Response.json(await dispatchTeamPush()); }
  catch { return Response.json({ error: "Team push queue unavailable; retry next minute." }, { status: 503 }); }
}

export const GET = cronHandler("team-push", runJob);
