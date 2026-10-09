import type { Metadata } from "next";
import "./globals.css";
import { GrowthTracker } from "@/components/growth-tracker";
import "./styles/dashboard.css";
import { getPublicAppUrl } from "@/lib/public-app-url";
import "./styles/distribution.css";
import "./styles/product-ui.css";
import "./styles/material-depth.css";
import "./styles/portal.css";
import "./styles/landing.css";
import "./styles/workspace-navigation.css";
import "./styles/premium-actions.css";
import "./styles/workspace-pages.css";
import "./styles/workspace-overlays.css";
import "./styles/mobile-workspace.css";
import "./styles/release-upload-controls.css";
import "./styles/release-audio-player.css";
import { SmartHelpLayer } from "@/components/smart-help-layer";

export const metadata: Metadata = {
  metadataBase: new URL(getPublicAppUrl()),
  title: { default: "HYMN Music | Music Distribution, Beats & Artist Services", template: "%s | HYMN Music" },
  description: "Release music worldwide, license beats, book mixing and mastering, manage royalties, and grow your independent music career with HYMN Music.",
  applicationName: "HYMN Music",
  authors: [{ name: "HYMN Music", url: "/" }],
  creator: "HYMN Music",
  publisher: "HYMN Music",
  category: "Music",
  keywords: ["music distribution India", "digital music distribution", "buy beats online", "beat licensing", "mixing and mastering", "independent artists", "music royalties", "release music on Spotify", "music producer marketplace", "HYMN Music"],
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "96x96" }],
    shortcut: "/favicon.png",
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }]
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    siteName: "HYMN Music",
    title: "HYMN Music | Music Distribution, Beats & Artist Services",
    description: "From beat licensing and professional mixing to worldwide music distribution and royalty management.",
    url: "/",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "HYMN Music" }]
  },
  twitter: { card: "summary", title: "HYMN Music", description: "Music distribution, beats, mixing, mastering and artist services in one platform.", images: ["/icon-512.png"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const origin = getPublicAppUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${origin}/#organization`, name: "HYMN Music", url: origin, logo: `${origin}/icon-512.png`, description: "Music distribution, beat licensing, mixing, mastering, royalty and artist services for independent musicians." },
      { "@type": "WebSite", "@id": `${origin}/#website`, url: origin, name: "HYMN Music", publisher: { "@id": `${origin}/#organization` }, inLanguage: "en-IN" }
    ]
  };
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
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
      <body suppressHydrationWarning>{children}<SmartHelpLayer />{process.env.GROWTH_ANALYTICS_ENABLED === "true" ? <GrowthTracker /> : null}</body>
    </html>
  );
}

// vercel trigger 12

// vercel trigger 14
