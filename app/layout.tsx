import { getSession } from '@/lib/session';
import { getSubscriptionMenuLabel } from '@/lib/subscription-helpers';
import { SubscriptionLabelProvider } from '@/components/subscription-label-context';
import { SiteHeader } from '@/components/site-header';
import { PersistentSiteWorkspace } from '@/components/persistent-site-workspace';
import { businessStructuredData } from "@/lib/public-business";
import { PublicNoScriptInformation } from "@/components/public-noscript-information";
import { jsonLd } from "@/lib/seo";
import { CustomerServiceInterestTracker } from "@/components/customer-service-interest";
import "./styles/royalty-splits.css";
import "./styles/gateway-finance.css";
import "./styles/heading-hierarchy.css";
import "./styles/release-catalogue-compact.css";
﻿import type { Metadata } from "next";
import "./globals.css";
import { GrowthTracker } from "@/components/growth-tracker";
import { ReferralWelcome } from "@/components/referral-welcome";
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
import "./styles/release-editor-premium.css";
import "./styles/release-record-review.css";
import "./styles/subscription-options.css";
import "./styles/home-goal-workspace.css";
import "./styles/home-editorial.css";
import "./styles/support-workspace.css";
import "./styles/faq-center.css";
import "./styles/sidebar-consistency.css";
import "./styles/workspace-page-transition.css";
import "./styles/workspace-enterprise.css";
import "./styles/distribution-consistency.css";
import "./styles/disclosure-polish.css";
import "./styles/policy-agreement.css";
import "./styles/dashboard-design-system.css";
import "./styles/release-navigation-header.css";
import "./styles/theme-tokens.css";
import "./styles/theme-accessibility.css";
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
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {}) },
  keywords: ["music distribution India", "digital music distribution", "buy beats online", "beat licensing", "mixing and mastering", "independent artists", "music royalties", "release music on Spotify", "music producer marketplace", "HYMN Music"],
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png", sizes: "96x96" }],
    shortcut: "/favicon.png",
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }]
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "HYMN Team", statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: "HYMN Music",
    title: "HYMN Music | Music Distribution, Beats & Artist Services",
    description: "From beat licensing and professional mixing to worldwide music distribution and royalty management.",
    url: "/",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "HYMN Music" }]
  },
  twitter: { card: "summary_large_image", title: "HYMN Music", description: "Music distribution, beats, mixing, mastering and artist services in one platform.", images: ["/opengraph-image"] },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const subscriptionLabel = await getSubscriptionMenuLabel(session?.sub);
  const origin = getPublicAppUrl();
  const structuredData = businessStructuredData(origin);
  return (
    <html lang="en" data-scroll-behavior="smooth" data-theme="light" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="only light" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
        <script
          id="hymn-theme-initializer"
          dangerouslySetInnerHTML={{
            __html: `(function () {
              try {
                var stored = localStorage.getItem("hymn-theme");
                var theme = stored === "dark" || stored === "light" ? stored : "light";
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = "only " + theme;
                document.querySelector('meta[name="color-scheme"]').content = "only " + theme;
                var language = localStorage.getItem("hymn_preferred_language");
                if (language) document.documentElement.lang = language;
              } catch (error) {
                document.documentElement.dataset.theme = "light";
                document.documentElement.style.colorScheme = "only light";
              }
            })();`
          }}
        />
      </head>
      <body suppressHydrationWarning><PublicNoScriptInformation/><SubscriptionLabelProvider label={subscriptionLabel}><PersistentSiteWorkspace user={session} header={<SiteHeader user={session}/>}>{children}</PersistentSiteWorkspace></SubscriptionLabelProvider><CustomerServiceInterestTracker /><SmartHelpLayer /><ReferralWelcome />{process.env.GROWTH_ANALYTICS_ENABLED === "true" ? <GrowthTracker /> : null}</body>
    </html>
  );
}

// vercel trigger 12

// vercel trigger 14
