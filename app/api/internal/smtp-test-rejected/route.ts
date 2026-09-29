import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { releaseStatusEmail } from "@/lib/email/templates/release-status-email";

export const maxDuration = 60;

export async function POST(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  const actual = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new NextResponse(null, { status: 401 });

  const template = releaseStatusEmail("release_rejected", {
    userName: "Aditya",
    releaseTitle: "God Level Song",
    releaseId: "smtp-test-god-level",
    releaseStatus: "rejected",
    manageReleaseUrl: `${getPublicAppUrl()}/dashboard?module=distribution`,
    rejectionReason: "Because your song was god level lol. This is a HYMN email test—no real release was rejected."
  });
  const result = await sendTransactionalEmail({
    to: "adityaujjain01@gmail.com",
    subject: `[TEST] ${template.subject}`,
    template: "release_rejected_smtp_test_v3",
    html: template.html,
    text: template.text,
    eventKey: "system:smtp-release-rejected-test-v3:adityaujjain01@gmail.com",
    entityType: "system_test",
    entityId: "smtp-release-rejected-v3"
  });
  return NextResponse.json(result, { status: result.status === "sent" || result.status === "duplicate_skipped" ? 200 : 502 });
}
