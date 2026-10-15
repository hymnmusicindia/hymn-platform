import { teamActor } from "@/lib/team/access";
import { teamWrite, prospectScope, audit } from "@/lib/team/service";
import { teamCsv } from "@/lib/team/csv";
import { TeamError } from "@/lib/team/policy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const a = await teamActor(new URL(request.url).searchParams.get("workspace") || undefined);
    if (!a.role.owner) throw new TeamError("Only the owner can export contact data.", 403);
    const csv = await teamWrite(a, async (tx, actor) => {
      if (!actor.role.owner) throw new TeamError("Owner access required.", 403);
      const items = await tx.teamProspect.findMany({ where: prospectScope(actor), take: 10000, include: { lead: true } });
      await audit(tx, actor, "prospects.exported", actor.workspaceId, { count: items.length });
      return teamCsv(["name", "email", "contactUrl", "sourceUrl", "evidence", "categories", "stage", "suppressed"], items.map(p => ({ ...p, name: p.lead?.name ?? p.name, email: p.lead?.email || p.email, stage: p.lead?.status.toUpperCase() ?? p.stage, categories: p.categories.join("|") })));
    });
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="HYMN-team-prospects.csv"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: error instanceof TeamError ? error.message : "Export unavailable." }, { status: error instanceof TeamError ? error.status : 503 }); }
}
