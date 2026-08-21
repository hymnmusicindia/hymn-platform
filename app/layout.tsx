import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSession } from "@/lib/session";
import { OnboardingEntryRedirect } from "@/components/onboarding-entry-redirect";

export const metadata: Metadata = {
  title: "HYMN Music - Hitting Your Music Notes",
  description:
    "HYMN full-stack platform for distribution, beats, services, payments, dashboard and admin operations.",
  icons: {
    icon: "/assets/hymnlogowhite.png",
    shortcut: "/assets/hymnlogowhite.png",
    apple: "/assets/hymnlogowhite.png"
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          id="hymn-theme-initializer"
          dangerouslySetInnerHTML={{
            __html: `(function () {
              try {
                var stored = localStorage.getItem("hymn-theme");
                var theme = stored === "dark" || stored === "light" ? stored : "light";
                document.documentElement.dataset.theme = theme;
                var language = localStorage.getItem("hymn_preferred_language");
                if (language) document.documentElement.lang = language;
              } catch (error) {
                document.documentElement.dataset.theme = "light";
              }
            })();`
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <SiteHeader user={session} />
        <OnboardingEntryRedirect isAuthenticated={Boolean(session)} />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}

// vercel trigger 12

// vercel trigger 14
