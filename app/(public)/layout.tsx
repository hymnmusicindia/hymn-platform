import { PublicAgentTools } from "@/components/public-agent-tools";
import {PublicReferralPrompt as FirstLoginReferralPrompt} from "@/components/public-workspace";
import { SiteFooter } from "@/components/site-footer";
import { PostPurchaseReviewPrompt } from "@/components/post-purchase-review-prompt";
import { WorkspaceGoalGuide } from "@/components/workspace-goal-guide";
import { getSession } from "@/lib/session";
import { PublicWorkspace } from "@/components/public-workspace";

export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  return <><PublicAgentTools/><PublicWorkspace user={session} header={null} footer={<SiteFooter />}>{children}</PublicWorkspace>{session ? <><FirstLoginReferralPrompt /><PostPurchaseReviewPrompt /><WorkspaceGoalGuide userId={session.sub} /></> : null}</>;
}
