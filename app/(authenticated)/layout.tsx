import { HymnPortalRoot } from "@/components/hymn-portal-root";
import { privateRobots } from "@/lib/seo";
export const metadata = { robots: privateRobots };
import { PolicyAgreementBanner } from "@/components/policy-agreement-banner";
import { getPolicyAgreementStatus, policyRevision } from "@/lib/policy-agreement";
import { WorkspaceGoalGuide } from "@/components/workspace-goal-guide";
import { PortalLayout } from "@/components/portal-layout";
import { PostPurchaseReviewPrompt } from "@/components/post-purchase-review-prompt";
import { getSession } from "@/lib/session";
import { ContactNumberPrompt } from "@/components/contact-number-prompt";

export default async function AuthenticatedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const policyStatus = session ? await getPolicyAgreementStatus(session.sub).catch(() => ({ ...policyRevision, accepted: false, acceptedAt: null })) : null;
  return <><HymnPortalRoot>{policyStatus ? <PolicyAgreementBanner initialStatus={policyStatus} /> : null}<PortalLayout user={session}>{children}</PortalLayout><PostPurchaseReviewPrompt />{session ? <WorkspaceGoalGuide userId={session.sub} /> : null}{session?.role === "customer" ? <ContactNumberPrompt userId={session.sub} /> : null}</HymnPortalRoot></>;
}
