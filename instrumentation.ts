export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const recipient = "adityaujjain01@gmail.com";
  if (process.env.EMAIL_PROVIDER?.toLowerCase() !== "smtp") return;

  const [{ releaseStatusEmail }, { sendTransactionalEmail }, { getPublicAppUrl }] = await Promise.all([
    import("@/lib/email/templates/release-status-email"),
    import("@/lib/email/send-transactional-email"),
    import("@/lib/public-app-url")
  ]);
  const template = releaseStatusEmail("release_rejected", {
    userName: "Aditya",
    releaseTitle: "SMTP Test Release",
    releaseId: "smtp-test",
    releaseStatus: "rejected",
    manageReleaseUrl: `${getPublicAppUrl()}/dashboard?module=distribution`,
    rejectionReason: "This is a test of HYMN's release-status email. No real release was rejected."
  });
  const result = await sendTransactionalEmail({
    to: recipient,
    subject: `[TEST] ${template.subject}`,
    template: "release_rejected_smtp_test",
    html: template.html,
    text: template.text,
    eventKey: "system:smtp-release-rejected-test:2026-09-30",
    entityType: "system_test",
    entityId: "smtp-release-rejected"
  });
  console.info("HYMN SMTP deployment test", { status: result.status, logId: result.logId });
}
