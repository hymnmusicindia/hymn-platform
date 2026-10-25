import { publicPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { PolicyDocument } from "@/components/policy-document";
import { getPolicy } from "@/lib/policy-content";
export const metadata: Metadata = publicPageMetadata("Privacy Policy", "How HYMN handles account, release, payment, royalty, support, and operational data.", "/privacy-policy");
export default function PrivacyPolicyPage() { return <PolicyDocument policy={getPolicy("privacy")!} />; }
