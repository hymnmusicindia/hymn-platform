import type { Metadata } from "next";
import { PolicyDocument } from "@/components/policy-document";
import { getPolicy } from "@/lib/policy-content";
export const metadata: Metadata = { title: "Terms of Service", description: "The agreement governing access to HYMN and its distribution, marketplace, royalty, and payout workflows.", alternates: { canonical: "/terms-of-service" } };
export default function TermsOfServicePage() { return <PolicyDocument policy={getPolicy("terms")!} />; }
