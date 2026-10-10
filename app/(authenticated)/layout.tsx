import { WorkspaceGoalGuide } from "@/components/workspace-goal-guide";
import { PortalLayout } from "@/components/portal-layout";
import { SiteHeader } from "@/components/site-header";
import { PostPurchaseReviewPrompt } from "@/components/post-purchase-review-prompt";
import { getSession } from "@/lib/session";

export default async function AuthenticatedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  return <div className="hymn-portal-root"><SiteHeader user={session} /><PortalLayout>{children}</PortalLayout><PostPurchaseReviewPrompt />{session ? <WorkspaceGoalGuide userId={session.sub} /> : null}</div>;
}
