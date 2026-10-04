import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PostPurchaseReviewPrompt } from "@/components/post-purchase-review-prompt";
import { OnboardingAgentDock } from "@/components/onboarding-agent-card";
import { getSession } from "@/lib/session";

export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  return <><SiteHeader user={session} />{children}<SiteFooter />{session ? <><PostPurchaseReviewPrompt /><OnboardingAgentDock /></> : null}</>;
}
