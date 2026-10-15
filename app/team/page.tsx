import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { teamActor } from "@/lib/team/access";
import { TeamError } from "@/lib/team/policy";
import { TeamWorkspaceUI } from "@/components/team/workspace";
import { SiteHeader } from "@/components/site-header";
import Link from "next/link";
import { TeamSetup } from "@/components/team/setup";
export const dynamic = "force-dynamic";
export const metadata = { title: "Team OS", robots: { index: false, follow: false } };
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const session = await getSession(); if (!session) redirect("/login?next=/team");
  const selected = await searchParams;
  const member = await teamActor(selected.workspace).catch(error => { if (!(error instanceof TeamError)) throw error; return null; });
  if (!member) return <main style={{ padding: "12vh 24px", maxWidth: 600, margin: "auto" }}><h1>Team Workspace access required</h1><p>An active internal membership is required. If you received an invitation, open its secure link while signed into the invited account.</p>{session.role === "admin" ? <TeamSetup /> : null}<Link href="/">Return to HYMN</Link></main>;
  return <><SiteHeader user={session} /><TeamWorkspaceUI key={member.workspaceId} actor={{ id: member.id, name: member.user.name, workspaceId: member.workspaceId, workspaceName: member.workspace.name, jobTitle: member.jobTitle, owner: member.role.owner, permissions: member.role.permissions }} /></>;
}
