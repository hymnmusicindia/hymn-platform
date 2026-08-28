import type { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import { ContentPageShell } from "@/components/content-page-shell";
import { FaqCenter } from "@/components/faq-center";

export const metadata: Metadata = {
  title: "FAQ | HYMN",
  description: "Searchable answers for HYMN distribution, pricing, artist profiles, payments, and technical support."
};

const LAST_UPDATED = "August 3, 2026";

export default function FAQPage() {
  return (
    <ContentPageShell
      eyebrow="FAQ"
      title="Answers grounded in how HYMN actually works."
      intro="Search distribution, metadata, rights, Beat Store, royalties, payouts, security, and account workflows—or follow a contextual help link directly to its answer."
      lastUpdated={LAST_UPDATED}
      sections={[
        {
          title: "How this page works",
          icon: <HelpCircle className="h-5 w-5" />,
          body: (
            <>
              <p>
                Search by keyword, pick a topic filter, or browse the questions below. The FAQ is designed to answer the most common HYMN questions without forcing you to leave the page.
              </p>
            </>
          )
        }
      ]}
      children={<FaqCenter />}
    />
  );
}
