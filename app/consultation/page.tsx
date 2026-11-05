import type { Metadata } from "next";
import { ConsultationPortal } from "@/components/consultation-portal";

export const metadata: Metadata = {
  title: "Free Music Career Consultation | HYMN Music",
  description: "Book a free consultation with HYMN to plan your next move in music.",
  robots: { index: true, follow: true }
};

export default function ConsultationPage() {
  return <ConsultationPortal />;
}
