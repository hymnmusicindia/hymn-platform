import "server-only";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { TeamError } from "./policy";

export async function teamIdentity() {
  const session = await getSession();
  if (!session) throw new TeamError("Sign in to HYMN to continue.", 401);
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, email: true, status: true } });
  if (!user || user.status !== "ACTIVE") throw new TeamError("This account is not active.", 403);
  return user;
}
export async function teamActor(workspaceId?: string) {
  const user = await teamIdentity();
  const member = await prisma.teamMember.findFirst({ where: { userId: user.id, status: "ACTIVE", ...(workspaceId ? { workspaceId } : {}) }, include: { role: true, user: { select: { name: true, avatar: true } }, workspace: true }, orderBy: { joinedAt: "asc" } });
  if (!member) throw new TeamError("An active internal team membership is required.", 403);
  return member;
}
