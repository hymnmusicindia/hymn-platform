"use client";

import { usePathname } from "next/navigation";
import { PortalLayout } from "@/components/portal-layout";

/** Keep destination pages in the same workspace as the service navigation. */
export function PublicWorkspace({ children, header, footer }: { children: React.ReactNode; header: React.ReactNode; footer: React.ReactNode }) {
  const pathname = usePathname();
  // Keep the homepage palette present while the page is replaced by its loading fallback.
  if (pathname === "/" || pathname === "/home") return <><span className="hymn-home-theme" hidden aria-hidden="true" />{header}{children}{footer}</>;
  return <div className="hymn-portal-root hymn-public-workspace">{header}<PortalLayout>{children}{footer}</PortalLayout></div>;
}
