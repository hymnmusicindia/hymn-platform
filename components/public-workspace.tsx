"use client";

import { usePathname } from "next/navigation";
import { FirstLoginReferralPrompt } from "@/components/first-login-referral-prompt";
import s from "./hymn-studio.module.css";
import { PortalLayout } from "@/components/portal-layout";

export function PublicReferralPrompt() {
  const pathname = usePathname();
  // The unified customer shell already owns this prompt on the Studio homepage.
  return pathname === '/studio' ? null : <FirstLoginReferralPrompt/>;
}



/** Keep destination pages in the same workspace as the service navigation. */
export function PublicWorkspace({ children, header, footer, user }: { children: React.ReactNode; header: React.ReactNode; footer: React.ReactNode; user?: { name:string; role:string } | null }) {
  const pathname = usePathname();
  // Keep the homepage palette present while the page is replaced by its loading fallback.
  if (pathname === "/" || pathname === "/home") return <><span className="hymn-home-theme" hidden aria-hidden="true" />{header}{children}{footer}</>;
  const studio = pathname === '/studio' || pathname.startsWith('/studio/');
  return <div className={studio ? s.root : "hymn-portal-root hymn-public-workspace"}>{header}<PortalLayout user={user}>{children}{!studio && footer}</PortalLayout></div>;
}
