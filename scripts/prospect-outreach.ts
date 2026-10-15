import { readFileSync } from "node:fs";
import { parse } from "dotenv";
for (const [key, value] of Object.entries(parse(readFileSync(".env.hostinger")))) {
  if (process.env[key] === undefined) process.env[key] = value;
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { newsletterToken } = await import("../lib/newsletter");
  const { emailLayout, emailText } = await import("../lib/email/email-templates");
  const { getPublicAppUrl } = await import("../lib/public-app-url");
  const { getEmailConfig } = await import("../lib/email/email-client");
  const { sendTransactionalEmail } = await import("../lib/email/send-transactional-email");
  const csv = readFileSync("HYMN_Music_Contacts_and_Addresses_Oct_2026.csv", "utf8").replace(/^\uFEFF/, "");
  const rows = csv.trim().split(/\r?\n/).slice(1).map(line => (line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g) ?? []).map(cell => cell.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')));
  const contacts = new Map<string, { name: string; category: string; type: string }>();
  for (const row of rows) for (const email of row[4].match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []) contacts.set(email.toLowerCase(), { name: row[2], category: row[0], type: row[6] });
  let added = 0, suppressed = 0, sent = 0, failed = 0, drafts = 0;
  try {
    for (const [email, contact] of contacts) {
      const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
      if (existing && existing.status !== "subscribed") { suppressed++; continue; }
      const subscriber = existing ?? await prisma.newsletterSubscriber.create({ data: { email, source: "prospect_research_oct_2026", unsubscribeToken: newsletterToken() } });
      if (!existing) added++;
      const partner = contact.category === "Partner" || /Partner prospect/.test(rows.find(row => row[2] === contact.name)?.[8] ?? "");
      const subject = `${contact.name}: save time on your next ${partner ? "artist release" : "music release"} with HYMN`;
      const body = partner
        ? `I came across ${contact.name} while researching independent music partners. With your work in ${contact.type.toLowerCase()}, coordinating an artist's next steps can take time away from the creative work.\n\nIf release coordination is a challenge for your team or clients, HYMN Music can help bring distribution, release preparation and artist services into one workspace. We would love to explore a referral or collaboration arrangement that complements your services and saves your team time.\n\nWould a short conversation about your current workflow be useful?`
        : `I came across ${contact.name} while researching independent artists. Preparing a release can mean juggling audio, artwork, credits, distribution and promotion while finding time to make music.\n\nIf that sounds familiar, HYMN Music can help you save time by bringing release preparation, music distribution, professional mixing and mastering, beat licensing and artist services into one workspace. We can help you identify the next step for your track and choose only the support you need.\n\nAre you working on a new release, or is there one part of the process currently slowing you down? Tell us what you need and we can discuss how HYMN could help.`;
      const unsubscribeUrl = `${getPublicAppUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribeToken)}`;
      const model = { title: "More time for your music", greeting: `Hi ${contact.name}${partner ? " team" : ""},`, body: `${body}\n\nWarm regards,\nThe HYMN Music team`, ctaLabel: "Explore HYMN Music", ctaUrl: getPublicAppUrl(), sections: [{ title: "About this email", body: "We found this business contact in public music research and are reaching out about a possible collaboration. You can opt out of future messages at any time.", linkLabel: "Unsubscribe", linkUrl: unsubscribeUrl }] };
      const html = emailLayout(model).replace("This transactional message relates to your HYMN account, purchase or release.", "A personal introduction from HYMN Music.");
      const text = emailText(model).replace("This transactional message relates to your HYMN account, purchase or release.", "A personal introduction from HYMN Music.");
      const eventKey = `prospect-oct-2026:${subscriber.id}:introduction-v1`;
      if (process.argv.includes("--send") && getEmailConfig().enabled) {
        const result = await sendTransactionalEmail({ to: email, subject, html, text, template: "prospect_personal_introduction", eventKey: `${eventKey}:send-v1`, entityType: "newsletter_subscriber", entityId: subscriber.id });
        if (result.status === "sent" || result.status === "duplicate_skipped") sent++; else failed++;
      } else {
        await prisma.emailLog.upsert({ where: { eventKey }, create: { toEmail: email, subject, template: "prospect_personal_introduction", eventKey, entityType: "newsletter_subscriber", entityId: String(subscriber.id), provider: "smtp", status: "draft", payload: { html, text } }, update: {} });
        drafts++;
      }
    }
    console.log(JSON.stringify({ uniqueEmails: contacts.size, added, suppressed, sent, failed, drafts, smtpConfigured: getEmailConfig().enabled }));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Prospect outreach failed"); process.exitCode = 1; });
