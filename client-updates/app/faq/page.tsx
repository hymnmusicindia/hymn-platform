import type { Metadata } from "next";
import { HelpCircle } from "lucide-react";
import { ContentPageShell } from "@/components/content-page-shell";
import { FaqCenter } from "@/components/faq-center";

export const metadata: Metadata = {
  title: "FAQ | HYMN",
  description: "Searchable answers for HYMN distribution, pricing, artist profiles, payments, and technical support."
};

const LAST_UPDATED = "March 30, 2026";

export default function FAQPage() {
  return (
    <ContentPageShell
      eyebrow="FAQ"
      title="Quick answers for distribution, pricing, artist profiles, and support."
      intro="Use the search bar to find answers instantly, then open a question for the detailed explanation."
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
