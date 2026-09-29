import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { releaseStatusEmail } from "@/lib/email/templates/release-status-email";
import { splitEmail } from "@/lib/email/templates/split-email";
import { payoutEmail } from "@/lib/email/templates/payout-email";
import { beatEmail } from "@/lib/email/templates/beat-email";
import { newsletterEmail } from "@/lib/newsletter";
import { getPublicAppUrl } from "@/lib/public-app-url";

export const maxDuration = 60;
type Preview = { name: string; subject: string; html: string; text: string };

function common(name: string, subject: string, body: string, cta = "Open HYMN") : Preview {
  const model = { title: subject, greeting: "Hi Aditya,", body, ctaLabel: cta, ctaUrl: `${getPublicAppUrl()}/dashboard` };
  return { name, subject, html: emailLayout(model), text: emailText(model) };
}

function previews(): Preview[] {
  const app = getPublicAppUrl();
  const releaseData = { userName: "Aditya", releaseTitle: "Sample HYMN Release", artistName: "Sample Artist", releaseId: "preview", releaseStatus: "preview", releaseDate: "16 October 2026", manageReleaseUrl: `${app}/dashboard?module=distribution`, correctionUrl: `${app}/dashboard?module=distribution`, rejectionReason: "Sample review note: please replace the uploaded audio file before resubmitting." };
  const releaseEvents = ["release_submitted", "release_under_review", "release_approved_by_hymn", "release_changes_requested", "release_rejected", "release_sent_to_distributor", "release_scheduled", "release_live", "release_distribution_failed"];
  const release = releaseEvents.map((event) => ({ name: event, ...releaseStatusEmail(event, releaseData) }));
  const splitInputs = [
    { event: "split_invite_received" as const, userName: "Aditya", ownerName: "Sample Owner", releaseTitle: "Sample HYMN Release", role: "Producer", sharePercent: 25, url: `${app}/dashboard?module=splits` },
    { event: "split_accepted" as const, userName: "Aditya", recipientName: "Sample Collaborator", releaseTitle: "Sample HYMN Release", url: `${app}/dashboard?module=splits` },
    { event: "split_declined" as const, userName: "Aditya", recipientName: "Sample Collaborator", releaseTitle: "Sample HYMN Release", url: `${app}/dashboard?module=splits` }
  ];
  const splits = splitInputs.map((input) => ({ name: input.event, ...splitEmail(input) }));
  const payoutInputs = [
    { event: "payout_earnings_updated" as const, userName: "Aditya", month: "September", year: 2026, url: `${app}/payout` },
    { event: "payout_request_submitted" as const, userName: "Aditya", requestedAmount: 10000, serviceFee: 200, netAmount: 9800, url: `${app}/payout` },
    { event: "payout_completed" as const, userName: "Aditya", netAmount: 9800, url: `${app}/payout` },
    { event: "payout_rejected" as const, userName: "Aditya", netAmount: 9800, url: `${app}/payout` }
  ];
  const payouts = payoutInputs.map((input) => ({ name: input.event, ...payoutEmail(input) }));
  const beatEvents = ["beat_purchase_success", "license_ready"] as const;
  const beats = beatEvents.map((event) => ({ name: event, ...beatEmail({ event, userName: "Aditya", beatTitle: "Sample HYMN Beat", url: `${app}/dashboard?module=purchases` }) }));
  const studio = [
    ["studio_request", "New HYMN Studio request", "A new mixing and mastering request was created for “Sample Studio Project”."],
    ["studio_accepted", "Your Studio project was accepted", "Your engineer accepted “Sample Studio Project” and work can now begin."],
    ["studio_declined", "Your Studio request was declined", "The engineer could not accept “Sample Studio Project”. Open the workspace for the latest options."],
    ["studio_delivery", "Your Studio delivery is ready", "A new delivery is ready for “Sample Studio Project”. Review and download it in your Studio workspace."],
    ["studio_revision", "A Studio revision was requested", "A revision was requested for “Sample Studio Project”. Open the workspace to review the notes."],
    ["studio_completed", "Studio project completed", "“Sample Studio Project” has been approved and marked complete."],
    ["studio_refund", "Studio payment refund update", "There is a refund update for “Sample Studio Project”. Open the workspace for the latest details."]
  ].map(([name, subject, body]) => common(name, subject, body, "Open Studio workspace"));
  const referral = [
    common("referral_reward_earned", "Your HYMN referral reward is ready", "Your referral qualified and INR 5 HYMN referral credit was added to your account.", "View referrals"),
    common("referred_user_bonus", "Your HYMN release credit is active", "INR 3 HYMN release credit was added to your account.", "View credits")
  ];
  const contributor = common("contributor_invitation", "Claim your Sample Artist contributor identity on HYMN", "A HYMN user invited you to claim the existing Sample Artist contributor identity. Preview invitations normally expire in 7 days.", "Claim contributor identity");
  const newsletterContent = newsletterEmail({ message: "This is a preview of a HYMN newsletter campaign.\n\nNewsletters are sent manually by an administrator only to active subscribers.", unsubscribeToken: "preview-not-a-real-subscription" });
  const newsletter = { name: "newsletter_campaign", subject: "HYMN newsletter campaign preview", ...newsletterContent };
  return [...release, ...splits, ...payouts, ...beats, ...studio, ...referral, contributor, newsletter];
}

export async function POST(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new NextResponse(null, { status: 401 });
  const index = Number(new URL(request.url).searchParams.get("index"));
  const catalog = previews();
  if (!Number.isInteger(index) || index < 0 || index >= catalog.length) return NextResponse.json({ error: "Invalid preview index.", count: catalog.length }, { status: 400 });
  const preview = catalog[index];
  const result = await sendTransactionalEmail({ to: "adityaujjain01@gmail.com", subject: `[TEST ${index + 1}/${catalog.length}] ${preview.subject}`, html: preview.html, text: preview.text, template: `preview_${preview.name}`, eventKey: `system:email-template-preview-2026-09-30:${index}`, entityType: "system_test", entityId: preview.name });
  return NextResponse.json({ index, count: catalog.length, name: preview.name, ...result }, { status: result.status === "sent" || result.status === "duplicate_skipped" ? 200 : 502 });
}
