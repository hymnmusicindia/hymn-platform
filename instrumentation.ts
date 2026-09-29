export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  if (process.env.EMAIL_PROVIDER?.toLowerCase() !== "smtp") return;

  const recipients = ["adityaujjain01@gmail.com"];
  const [{ releaseStatusEmail }, { sendTransactionalEmail }, { getPublicAppUrl }] = await Promise.all([
    import("@/lib/email/templates/release-status-email"),
    import("@/lib/email/send-transactional-email"),
    import("@/lib/public-app-url")
  ]);

  for (const recipient of recipients) {
    const template = releaseStatusEmail("release_rejected", {
      userName: recipient.startsWith("rajvir") ? "Rajvir" : "Aditya",
      releaseTitle: "God Level Song",
      releaseId: "smtp-test-god-level",
      releaseStatus: "rejected",
      manageReleaseUrl: `${getPublicAppUrl()}/dashboard?module=distribution`,
      rejectionReason: "Because your song was god level lol. This is a HYMN email test—no real release was rejected."
    });
    const result = await sendTransactionalEmail({
      to: recipient,
      subject: `[TEST] ${template.subject}`,
      template: "release_rejected_smtp_test_v2",
      html: template.html,
      text: template.text,
      eventKey: `system:smtp-release-rejected-test-v2-retry:${recipient}`,
      entityType: "system_test",
      entityId: "smtp-release-rejected-v2"
    });
    console.info("HYMN SMTP deployment test v2", { recipient, status: result.status, logId: result.logId });
  }
}
