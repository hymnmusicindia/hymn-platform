import { getEmailClient, getEmailConfig } from "@/lib/email/email-client";
import { releaseStatusEmail } from "@/lib/email/templates/release-status-email";

async function main() {
  const recipient = process.argv[2]?.trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error("Usage: npm run email:test-rejected -- customer@example.com");
  }

  const config = getEmailConfig();
  const client = getEmailClient();
  if (!config.enabled || !client) throw new Error("Email is disabled or SMTP credentials are unavailable.");

  const template = releaseStatusEmail("release_rejected", {
    userName: "Aditya",
    releaseTitle: "SMTP Test Release",
    releaseId: "test",
    releaseStatus: "rejected",
    manageReleaseUrl: `${config.appUrl}/dashboard?module=distribution`,
    rejectionReason: "This is a test of HYMN's release-status email. No real release was rejected."
  });
  const result = await client.emails.send({
    from: config.from,
    to: recipient,
    replyTo: config.replyTo,
    subject: `[TEST] ${template.subject}`,
    html: template.html,
    text: template.text
  });
  if (result.error) throw new Error(result.error.message);
  console.log(`Test release-rejected email accepted by ${config.provider}. Message ID: ${result.data?.id || "unavailable"}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Test email failed.");
  process.exitCode = 1;
});
