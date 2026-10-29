import {PublicReferralPrompt as FirstLoginReferralPrompt} from "@/components/public-workspace";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PostPurchaseReviewPrompt } from "@/components/post-purchase-review-prompt";
import { WorkspaceGoalGuide } from "@/components/workspace-goal-guide";
import { getSession } from "@/lib/session";
import { PublicWorkspace } from "@/components/public-workspace";
import { getSubscriptionMenuLabel } from "@/lib/subscription-helpers";
import { SubscriptionLabelProvider } from "@/components/subscription-label-context";

export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const subscriptionLabel = await getSubscriptionMenuLabel(session?.sub);
  return <SubscriptionLabelProvider label={subscriptionLabel}><PublicWorkspace user={session} header={<SiteHeader user={session} />} footer={<SiteFooter />}>{children}</PublicWorkspace>{session ? <><FirstLoginReferralPrompt /><PostPurchaseReviewPrompt /><WorkspaceGoalGuide userId={session.sub} /></> : null}</SubscriptionLabelProvider>;
}
