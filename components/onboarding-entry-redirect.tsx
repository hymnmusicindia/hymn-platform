"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ONBOARDING_SEEN_KEY } from "@/lib/onboarding-client";

const PUBLIC_ENTRY_PATHS = new Set(["/", "/services", "/distribution", "/beat-store", "/beatstore"]);

export function OnboardingEntryRedirect({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (isAuthenticated || pathname === "/welcome" || !PUBLIC_ENTRY_PATHS.has(pathname)) return;
    if (!localStorage.getItem(ONBOARDING_SEEN_KEY)) router.replace("/welcome");
  }, [isAuthenticated, pathname, router]);
  return null;
}

// vercel trigger 12
