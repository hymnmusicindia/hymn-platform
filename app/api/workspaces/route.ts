import { getAdminAccessForPage } from "@/lib/access";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export async function GET() {
  const session = await getSession();
  const access = await getAdminAccessForPage();
  if (!session && !access) return Response.json({ error: "Sign in required." }, { status: 401 });
  const items: { id: string; name: string; kind: string; href: string }[] = [];
  if (session) {
    const memberships = await prisma.teamMember.findMany({ where: { userId: session.sub, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { workspaceId: true, workspace: { select: { name: true } } } });
    for (const m of memberships) items.push({ id: m.workspaceId, name: m.workspace.name, kind: "team", href: `/team?workspace=${m.workspaceId}` });
  }
  // System workspace: not a TeamWorkspace membership and never inherited from a team role.
  if (access?.permissions.length) items.push({ id: "admin", name: "HYMN Admin OS", kind: "admin", href: "/admin" });
  return Response.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
