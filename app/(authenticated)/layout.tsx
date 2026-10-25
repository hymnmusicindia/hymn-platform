import { privateRobots } from "@/lib/seo";
export const metadata = { robots: privateRobots };
import { PolicyAgreementBanner } from "@/components/policy-agreement-banner";
import { getPolicyAgreementStatus, policyRevision } from "@/lib/policy-agreement";
import { WorkspaceGoalGuide } from "@/components/workspace-goal-guide";
import { PortalLayout } from "@/components/portal-layout";
import { SiteHeader } from "@/components/site-header";
import { PostPurchaseReviewPrompt } from "@/components/post-purchase-review-prompt";
import { getSession } from "@/lib/session";
import { getSubscriptionMenuLabel } from "@/lib/subscription-helpers";
import { SubscriptionLabelProvider } from "@/components/subscription-label-context";

export default async function AuthenticatedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const policyStatus = session ? await getPolicyAgreementStatus(session.sub).catch(() => ({ ...policyRevision, accepted: false, acceptedAt: null })) : null;
  const subscriptionLabel = await getSubscriptionMenuLabel(session?.sub);
  return <SubscriptionLabelProvider label={subscriptionLabel}><div className="hymn-portal-root">{policyStatus ? <PolicyAgreementBanner initialStatus={policyStatus} /> : null}<SiteHeader user={session} /><PortalLayout>{children}</PortalLayout><PostPurchaseReviewPrompt />{session ? <WorkspaceGoalGuide userId={session.sub} /> : null}</div></SubscriptionLabelProvider>;
}
