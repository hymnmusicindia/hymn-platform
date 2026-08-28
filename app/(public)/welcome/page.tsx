import type { Metadata } from "next";
import { getSession } from "@/lib/session";
import { OnboardingExperience } from "@/components/onboarding-experience";

export const metadata: Metadata = { title: "Find your path | HYMN", description: "A personal route into HYMN for artists and producers." };

export default async function WelcomePage() {
  const session = await getSession();
  return <OnboardingExperience isAuthenticated={Boolean(session)} />;
}

// vercel trigger 12
