import type { Metadata } from "next";
import { PolicyDocument } from "@/components/policy-document";
import { getPolicy } from "@/lib/policy-content";
export const metadata: Metadata = { title: "Privacy Policy | HYMN", description: "How HYMN handles account, release, payment, royalty, support, and operational data." };
export default function PrivacyPolicyPage() { return <PolicyDocument policy={getPolicy("privacy")!} />; }
