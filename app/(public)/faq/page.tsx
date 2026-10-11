import type { Metadata } from "next";
import { FaqCenter } from "@/components/faq-center";

export const metadata: Metadata = {
  title: "Music Distribution & Beat Licensing FAQ",
  description: "Answers about HYMN music distribution, beat licences, pricing, artist profiles, payments, royalties and technical support.",
  alternates: { canonical: "/faq" }
};

export default function FAQPage() {
  return <main className="faq-page"><FaqCenter /></main>;
}
