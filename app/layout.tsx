import type { Metadata } from "next";
import "./globals.css";
import "./styles/dashboard.css";
import { getPublicAppUrl } from "@/lib/public-app-url";
import "./styles/distribution.css";
import "./styles/product-ui.css";

export const metadata: Metadata = {
  metadataBase: new URL(getPublicAppUrl()),
  title: "HYMN Music - Hitting Your Music Notes",
  description:
    "HYMN full-stack platform for distribution, beats, services, payments, dashboard and admin operations.",
  icons: {
    icon: [{ url: "/assets/hymn-favicon.png?v=4", type: "image/png", sizes: "180x180" }],
    shortcut: "/assets/hymn-favicon.png?v=4",
    apple: [{ url: "/assets/hymn-favicon.png?v=4", type: "image/png", sizes: "180x180" }]
  },
  alternates: { canonical: "/" }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

// vercel trigger 12

// vercel trigger 14
