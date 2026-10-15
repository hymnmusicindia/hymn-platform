import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { teamMutation, teamWrite, notify } from "@/lib/team/service";
import { weekStartIndia } from "@/lib/team/policy";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`); const actual = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const owners = await prisma.teamMember.findMany({ where: { status: "ACTIVE", role: { owner: true }, user: { status: "ACTIVE" } }, include: { role: true } });
    let workspaces = 0;
    const handled = new Set<string>();
    for (const owner of owners) {
      if (handled.has(owner.workspaceId)) continue;
      handled.add(owner.workspaceId);
      await teamMutation(owner, "workflow-sync", {});
      await teamWrite(owner, async (tx, a) => {
        const now = new Date(); const local = new Date(now.getTime() + 330 * 60000); const day = local.getUTCDay(); const week = weekStartIndia(now).toISOString().slice(0, 10);
        const members = await tx.teamMember.findMany({ where: { workspaceId: a.workspaceId, status: "ACTIVE", user: { status: "ACTIVE" } } });
        for (const member of members) {
          const preferences = member.preferences as { digest?: string; fridayReminder?: boolean };
          const key = preferences.digest === "DAILY" ? `${member.id}:digest:${local.toISOString().slice(0, 10)}` : preferences.digest === "WEEKLY" && day === 5 ? `${member.id}:digest:${week}` : "";
          if (key && !await tx.teamWorkflowEvent.findUnique({ where: { eventKey: key } })) {
            const count = await tx.teamTask.count({ where: { ownerId: member.id, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } } }); await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey: key } }); await notify(tx, member.id, `Your activity digest: ${count} active assignments`);
          }
          const reportKey = `${member.id}:friday:${week}`;
          if (day === 5 && preferences.fridayReminder && !await tx.teamWorkflowEvent.findUnique({ where: { eventKey: reportKey } })) { await tx.teamWorkflowEvent.create({ data: { workspaceId: a.workspaceId, eventKey: reportKey } }); await notify(tx, member.id, "Review and submit your weekly report", "/team?module=reports"); }
        }
      }); workspaces++;
    }
    return Response.json({ workspaces });
  } catch { return Response.json({ error: "Team automation did not complete; it will retry safely." }, { status: 503 }); }
}
