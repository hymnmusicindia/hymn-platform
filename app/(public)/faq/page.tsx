import { publicPageMetadata } from "@/lib/seo";
﻿import type { Metadata } from "next";
import { FaqCenter } from "@/components/faq-center";

export const metadata: Metadata = publicPageMetadata("Music Distribution & Beat Licensing FAQ", "Answers about HYMN music distribution, beat licences, pricing, artist profiles, payments, royalties and technical support.", "/faq");

export default function FAQPage() {
  return <main className="faq-page"><FaqCenter /></main>;
}
