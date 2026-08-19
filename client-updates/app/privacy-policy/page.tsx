import type { Metadata } from "next";
import { ShieldCheck, Database, Users, Share2, Lock, Cookie, RefreshCw, Mail } from "lucide-react";
import { ContentPageShell } from "@/components/content-page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy | HYMN",
  description: "How HYMN collects, uses, stores, and protects user data across distribution, analytics, and support workflows."
};

const LAST_UPDATED = "March 30, 2026";

export default function PrivacyPolicyPage() {
  return (
    <ContentPageShell
      eyebrow="Privacy Policy"
      title="How HYMN handles user, release, and payment data."
      intro="This policy explains how HYMN collects and uses information across music distribution, artist dashboards, billing, support, and platform operations."
      lastUpdated={LAST_UPDATED}
      sections={[
        {
          title: "1. Introduction",
          icon: <ShieldCheck className="h-5 w-5" />,
          body: (
            <>
              <p>
                HYMN is a music distribution and artist operations platform that helps users submit recordings, manage releases, track performance, and access support. This Privacy Policy applies when you create an account, submit music, make a payment, visit our website, or contact our team.
              </p>
              <p>
                By using HYMN, you understand that we process information to operate the platform, complete submissions, maintain account security, and deliver the services you request.
              </p>
            </>
          )
        },
        {
          title: "2. Information We Collect",
          icon: <Database className="h-5 w-5" />,
          body: (
            <>
              <p>We collect information directly from you, from your activity on the platform, and from third-party services needed to complete your release or payment.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Account details such as name, email address, password, and role selection.</li>
                <li>Billing and payment information such as transaction status, plan selection, and payment gateway references.</li>
                <li>Music metadata including artist names, release titles, track titles, credits, language, territory, and platform selections.</li>
                <li>Uploaded files such as audio masters, artwork, cover licenses, and release assets.</li>
                <li>Usage data such as dashboard activity, page visits, IP-derived security logs, device type, and basic diagnostic data.</li>
                <li>Support communications submitted through contact forms, email, or other help channels.</li>
              </ul>
            </>
          )
        },
        {
          title: "3. How We Use Data",
          icon: <Users className="h-5 w-5" />,
          body: (
            <>
              <p>HYMN uses your data for the following purposes:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>To process distribution submissions and route your release to selected DSPs or other supported destinations.</li>
                <li>To review metadata, files, and artwork for quality control and platform compliance.</li>
                <li>To calculate analytics, revenue summaries, and release performance inside your dashboard.</li>
                <li>To send operational messages about review status, payment confirmation, release updates, or support requests.</li>
                <li>To detect fraud, fake streams, suspicious submissions, spam, or unauthorized access.</li>
                <li>To comply with legal, tax, accounting, and regulatory obligations where required.</li>
              </ul>
            </>
          )
        },
        {
          title: "4. Third-Party Services",
          icon: <Share2 className="h-5 w-5" />,
          body: (
            <>
              <p>
                HYMN works with third-party services to complete distribution and payments. These services may include Spotify, Apple Music, YouTube Music, payment gateways such as Razorpay, cloud infrastructure providers, and other approved platform partners.
              </p>
              <p>
                We share only the information necessary to complete the service you requested. Each third party has its own privacy policy and operational rules, and their processing is governed by those terms as well as our contractual arrangements where applicable.
              </p>
            </>
          )
        },
        {
          title: "5. Data Storage & Security",
          icon: <Lock className="h-5 w-5" />,
          body: (
            <>
              <p>
                We store release records, account data, and operational logs in the systems used to run HYMN. Uploaded files and media assets are stored in configured file storage locations, while structured records may be kept in our database layer.
              </p>
              <p>
                We use reasonable administrative, technical, and organizational safeguards to protect data against unauthorized access, loss, or misuse. No online system can be completely secure, so we cannot guarantee absolute security.
              </p>
            </>
          )
        },
        {
          title: "6. User Rights",
          icon: <Users className="h-5 w-5" />,
          body: (
            <>
              <p>Depending on your location and the data we hold, you may have the right to:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Access the personal information associated with your account.</li>
                <li>Correct inaccurate metadata or account details.</li>
                <li>Request deletion of certain information, subject to legal or accounting requirements.</li>
                <li>Withdraw marketing preferences where applicable.</li>
                <li>Request a copy of the information you provided to us.</li>
                <li>Object to or limit certain processing where the law allows it.</li>
              </ul>
            </>
          )
        },
        {
          title: "7. Cookies",
          icon: <Cookie className="h-5 w-5" />,
          body: (
            <>
              <p>
                HYMN uses essential cookies and similar technologies to keep you signed in, remember preferences, protect accounts, and keep the platform functioning. We may also use limited analytics cookies to understand product usage and improve the experience.
              </p>
              <p>
                You can control cookies through your browser settings, but disabling essential cookies may prevent parts of the site from working properly.
              </p>
            </>
          )
        },
        {
          title: "8. Changes to This Policy",
          icon: <RefreshCw className="h-5 w-5" />,
          body: (
            <>
              <p>
                We may update this Privacy Policy when our products, partners, or legal obligations change. If the changes are material, we will update the posted date and may provide additional notice through the platform or by email.
              </p>
              <p>
                Continued use of HYMN after an update means you accept the revised policy.
              </p>
            </>
          )
        },
        {
          title: "9. Contact Information",
          icon: <Mail className="h-5 w-5" />,
          body: (
            <>
              <p>
                If you have questions about this Privacy Policy or want to exercise your rights, contact our support team through the <span className="font-semibold" style={{ color: "var(--text)" }}>Contact</span> page on HYMN.
              </p>
              <p>
                We may request additional information to verify your identity before fulfilling a privacy request.
              </p>
            </>
          )
        }
      ]}
      footerCta={{
        title: "Need help with a privacy request?",
        body: "Our support team can help with account questions, release records, or data access requests tied to your HYMN profile.",
        href: "/contact",
        label: "Contact Support"
      }}
    />
  );
}
