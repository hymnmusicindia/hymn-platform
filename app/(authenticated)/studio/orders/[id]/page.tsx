import { notFound, redirect } from "next/navigation";
import { getCurrentUserForPage } from "@/lib/access";
import { getStudioWorkspace } from "@/lib/studio-services";
import { studioWorkspaceView } from "@/lib/studio-workspace-view";
import { StudioWorkspace } from "@/components/studio-workspace";
export const dynamic = "force-dynamic";
export default async function StudioOrderPage({ params }: { params: Promise<{ id: string }> }) {
 const user = await getCurrentUserForPage(); if (!user) redirect("/login");
 const order = await getStudioWorkspace((await params).id, user.id).catch(() => null);
 if (!order) notFound();
 return <StudioWorkspace userId={user.id} workspace={studioWorkspaceView(order)}/>;
}
