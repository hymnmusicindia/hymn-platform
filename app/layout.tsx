import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSession } from "@/lib/session";
import { FirstVisitOnboarding } from "@/components/first-visit-onboarding";

export const metadata: Metadata = {
  title: "HYMN Platform",
  description:
    "HYMN full-stack platform for distribution, beats, services, payments, dashboard and admin operations."
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
              try {
                var stored = localStorage.getItem("hymn-theme");
                var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
                var theme = stored === "dark" || stored === "light" ? stored : (systemDark ? "dark" : "dark");
                document.documentElement.dataset.theme = theme;
                var language = localStorage.getItem("hymn_preferred_language");
                if (language) document.documentElement.lang = language;
              } catch (error) {
                document.documentElement.dataset.theme = "dark";
              }
            })();`
          }}
        />
        <SiteHeader user={session} />
        <FirstVisitOnboarding isAuthenticated={Boolean(session)} />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
