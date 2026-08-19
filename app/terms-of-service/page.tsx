import type { Metadata } from "next";
import { Scale, UserCheck, BadgeDollarSign, ShieldBan, Copyright, AlertTriangle, Gavel, FilePenLine, Flag } from "lucide-react";
import { ContentPageShell } from "@/components/content-page-shell";

export const metadata: Metadata = {
  title: "Terms of Service | HYMN",
  description: "The rules that govern use of HYMN for music distribution, billing, content ownership, and account access."
};

const LAST_UPDATED = "March 30, 2026";

export default function TermsOfServicePage() {
  return (
    <ContentPageShell
      eyebrow="Terms of Service"
      title="Platform terms for artists, producers, customers, and partners."
      intro="These terms govern use of HYMN distribution workflows, artist tools, catalog management, payments, and support services."
      lastUpdated={LAST_UPDATED}
      sections={[
        {
          title: "1. Acceptance of Terms",
          icon: <Scale className="h-5 w-5" />,
          body: (
            <>
              <p>
                By creating an account, browsing the platform, uploading content, or submitting a release, you agree to these Terms of Service and to any additional rules displayed at checkout, in the release form, or in a plan description.
              </p>
              <p>
                If you do not agree, you must not use HYMN to submit or manage releases.
              </p>
            </>
          )
        },
        {
          title: "2. User Responsibilities",
          icon: <UserCheck className="h-5 w-5" />,
          body: (
            <>
              <p>You are responsible for the accuracy and legality of everything you submit to HYMN.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>You must own or control the rights needed to distribute the recording, artwork, and metadata you upload.</li>
                <li>You must not upload copyrighted material, samples, stems, images, or credits that you do not have permission to use.</li>
                <li>You must keep account details accurate and maintain the security of your login credentials.</li>
                <li>You must ensure all collaborators, credits, and splits are entered truthfully.</li>
              </ul>
            </>
          )
        },
        {
          title: "3. Distribution Rules",
          icon: <Flag className="h-5 w-5" />,
          body: (
            <>
              <p>
                HYMN may distribute releases to DSPs such as Spotify, Apple Music, YouTube Music, Amazon Music, JioSaavn, Gaana, and other supported destinations shown in the product.
              </p>
              <p>
                DSPs and UGC systems are not the same. DSPs are streaming and download services that host your release as a catalog product. UGC platforms use user-generated-content workflows and may apply matching, claiming, or monetization rules differently. If HYMN offers a UGC or content matching destination, those rules are controlled by the receiving platform and your rights to the recording.
              </p>
              <p>
                Content ID-style registration or matching, when available, is subject to rights verification. You may not submit the same recording to conflicting fingerprinting programs or make duplicate claims on recordings you do not fully control.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>HYMN may reject or pause releases that fail artwork, metadata, or rights checks.</li>
                <li>Scheduled releases must meet the minimum lead time shown in the product flow.</li>
                <li>HYMN may remove content that violates store, platform, or legal requirements.</li>
              </ul>
            </>
          )
        },
        {
          title: "4. Payments & Refunds",
          icon: <BadgeDollarSign className="h-5 w-5" />,
          body: (
            <>
              <p>HYMN supports both one-time and subscription-style distribution billing.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>One-time release submission: ₹99 per release.</li>
                <li>Half-yearly plan: ₹700 for the 180-day subscription option shown at checkout.</li>
                <li>Yearly plan: ₹1,600 for the annual subscription option shown at checkout.</li>
              </ul>
              <p>
                We do not hide charges. The amount shown at checkout is the amount you are expected to pay, excluding any taxes or payment-gateway fees that are separately displayed if applicable.
              </p>
              <p>
                Once a release has been submitted for review or processing has begun, fees are generally non-refundable. Refunds may only be offered where required by law or where HYMN approves a written exception.
              </p>
              <p>
                If a payment fails, the release is not queued for delivery until payment verification succeeds.
              </p>
            </>
          )
        },
        {
          title: "5. Content Ownership",
          icon: <Copyright className="h-5 w-5" />,
          body: (
            <>
              <p>
                You retain ownership of your recordings, artwork, metadata, and underlying rights, provided you have the authority to submit them.
              </p>
              <p>
                HYMN acts as a non-exclusive distributor and service provider. You grant us the limited license needed to host, encode, transmit, review, display, and deliver your content to the services you select.
              </p>
              <p>
                This license ends when your account, release, or distribution arrangement ends, except for records we must keep for legal, accounting, operational, or dispute-resolution purposes.
              </p>
            </>
          )
        },
        {
          title: "6. Prohibited Activities",
          icon: <ShieldBan className="h-5 w-5" />,
          body: (
            <>
              <p>HYMN does not allow fraudulent, abusive, or unlawful use of the platform.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Fake streams, bots, artificial playlisting, or manipulated engagement.</li>
                <li>Illegal, hateful, defamatory, obscene, or infringing content.</li>
                <li>Impersonation, forged rights claims, or false metadata submissions.</li>
                <li>Malware, spam, scraping, or attempts to bypass security controls.</li>
                <li>Repeated refund abuse, payment fraud, or chargeback manipulation.</li>
              </ul>
            </>
          )
        },
        {
          title: "7. Termination Clause",
          icon: <AlertTriangle className="h-5 w-5" />,
          body: (
            <>
              <p>
                HYMN may suspend, restrict, or terminate access if we believe a user has breached these terms, submitted unlawful content, created fraud risk, or interfered with platform operations.
              </p>
              <p>
                We may also remove releases from the queue or from active processing if ownership, compliance, or payment issues are discovered.
              </p>
            </>
          )
        },
        {
          title: "8. Limitation of Liability",
          icon: <Gavel className="h-5 w-5" />,
          body: (
            <>
              <p>
                To the fullest extent permitted by law, HYMN is not liable for indirect, incidental, special, or consequential damages, including lost revenue, delayed availability, store-side rejection, metadata changes, or third-party platform actions.
              </p>
              <p>
                We do not guarantee that a DSP will accept every release, that a release will go live on a specific date, or that a platform will preserve any particular ranking, playlist placement, or monetization outcome.
              </p>
            </>
          )
        },
        {
          title: "9. Modifications",
          icon: <FilePenLine className="h-5 w-5" />,
          body: (
            <>
              <p>
                HYMN may revise these terms when our services, pricing, partners, or legal obligations change. When we make important changes, we will update the posted date or provide notice through the platform.
              </p>
              <p>
                Continued use of HYMN after the effective date of an update means you accept the revised terms.
              </p>
            </>
          )
        },
        {
          title: "10. Governing Law (India)",
          icon: <Flag className="h-5 w-5" />,
          body: (
            <>
              <p>
                These terms are governed by the laws of India. Any dispute relating to the use of HYMN, to the extent not resolved informally, will be handled under the jurisdiction available in India.
              </p>
              <p>
                If any part of these terms is found unenforceable, the remaining terms remain in effect.
              </p>
            </>
          )
        }
      ]}
      footerCta={{
        title: "Need help with a submission or billing issue?",
        body: "Our support team can help with release status, payment problems, and account questions before you resubmit.",
        href: "/contact",
        label: "Contact Support"
      }}
    />
  );
}
