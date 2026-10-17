import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { getEmailConfig } from "@/lib/email/email-client";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { CLIENT_INTERESTS, type ClientInterest } from "./client-interests";

async function contactSuppressed(email: string) {
  const match = { equals: email, mode: "insensitive" as const };
  const counts = await Promise.all([
    prisma.newsletterSubscriber.count({ where: { email: match, status: { not: "subscribed" } } }),
    prisma.teamClient.count({ where: { status: "DO_NOT_CONTACT", OR: [{ email: match }, { secondaryEmail: match }] } }),
    prisma.teamProspect.count({ where: { email: match, OR: [{ suppressed: true }, { stage: "DO_NOT_CONTACT" }] } }),
  ]);
  return counts.some(count => count > 0);
}

export async function assertClientWelcomeRetryAllowed(email: string) {
  const job = await prisma.teamClientWelcome.findUnique({ where: { email: email.toLowerCase() }, include: { client: true } });
  if (!job || job.client.status !== "ACTIVE" || job.client.email !== email.toLowerCase()) throw new Error("This contact is no longer eligible for an introduction.");
  const addresses = [job.client.email, job.client.secondaryEmail].filter(Boolean);
  if (await prisma.user.count({ where: { OR: addresses.map(value => ({ email: { equals: value, mode: "insensitive" } })) } }) || await contactSuppressed(email)) throw new Error("The contact registered or opted out. Do not resend the introduction.");
  return job;
}

export function clientWelcomeTemplate(client: { name: string; city: string; state: string; interests: string[] }) {
  const interests = client.interests.map(key => CLIENT_INTERESTS[key as ClientInterest]).filter(Boolean);
  const place = [client.city, client.state].filter(Boolean).join(", ");
  const context = interests.length ? `Our team noted your interest in ${interests.join(" and ").toLowerCase()}${place ? ` and that you're based in ${place}` : ""}.` : place ? `Our team added your contact to HYMN and noted that you're based in ${place}.` : "Our team added your contact to HYMN, so I wanted to introduce what we do.";
  const help: Record<ClientInterest, string> = {
    BEAT_SALES: "We can help you build a beat storefront, set your own licence prices and keep sales organised.",
    BEAT_PURCHASE: "You can explore beats and choose a licence that fits your next project.",
    DISTRIBUTION: "We can help you prepare your release and distribute your music to streaming platforms.",
    PLAYLIST_CURATION: "We can walk you through our playlist-curation opportunities and review workflow.",
    MIX_MASTER: "We can help you find a mixing or mastering engineer who fits your sound and budget.",
    BECOME_ENGINEER: "We can explain how to apply as a HYMN engineer, showcase your work and receive client projects.",
  };
  const body = `${context}\n\n${client.interests.map(key => help[key as ClientInterest]).filter(Boolean).join(" ") || "HYMN brings beats, mixing and mastering, and music distribution into one place."}\n\nThe idea is to save you time on the back-and-forth, so you can focus on your music. What are you working on right now? Reply here or message us on WhatsApp, and we'll help you figure out the next step.\n\nNo pressure to sign up. If this isn't relevant, reply “stop” and we'll mark your contact as do not contact.\n\nThe HYMN team`;
  const model = { title: "A quick hello from HYMN", greeting: `Hi ${client.name.trim().split(/\s+/)[0]},`, body, ctaLabel: "Explore HYMN", ctaUrl: getPublicAppUrl() };
  // This is an introduction to a saved contact, not a transactional account notice.
  return { subject: `${client.name.trim().split(/\s+/)[0]}, a quick hello from HYMN`, html: emailLayout(model).replace("This transactional message relates to your HYMN account, purchase or release.", "Our team saved your contact details. Reply if you would prefer not to hear from us."), text: emailText(model).replace("This transactional message relates to your HYMN account, purchase or release.", "Our team saved your contact details. Reply to opt out.") };
}

export async function processClientWelcomes(clientId?: string, limit = 5, deliver = sendTransactionalEmail) {
  if (deliver === sendTransactionalEmail && !getEmailConfig().enabled) return { sent: 0, disabled: true };
  // A crashed SMTP send is ambiguous. Preserve it for review, never blindly resend.
  await prisma.teamClientWelcome.updateMany({ where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 5 * 60000) } }, data: { status: "REVIEW", error: "Delivery outcome is unknown. Review email logs before retrying." } });
  const jobs = await prisma.teamClientWelcome.findMany({ where: { status: "PENDING", ...(clientId ? { clientId } : {}) }, orderBy: { createdAt: "asc" }, take: limit });
  let sent = 0;
  const deadline = Date.now() + 35000;
  for (const job of jobs) {
    if (Date.now() >= deadline) break;
    if (!(await prisma.teamClientWelcome.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "SENDING" } })).count) continue;
    try {
      const client = await prisma.teamClient.findUniqueOrThrow({ where: { id: job.clientId }, include: { owner: { include: { user: { select: { status: true } } } } } });
      const addresses = [client.email, client.secondaryEmail].filter(Boolean);
      const [registered, suppressed] = await Promise.all([
        prisma.user.count({ where: { OR: addresses.map(email => ({ email: { equals: email, mode: "insensitive" } })) } }),
        contactSuppressed(job.email),
      ]);
      if (client.status !== "ACTIVE" || client.owner.status !== "ACTIVE" || client.owner.user.status !== "ACTIVE" || job.email !== client.email || registered || suppressed) {
        await prisma.teamClientWelcome.update({ where: { id: job.id }, data: { status: "SKIPPED", error: "Contact changed, suppressed, inactive or already registered." } }); continue;
      }
      const eventKey = `team-client-welcome:${createHash("sha256").update(job.email).digest("hex")}`;
      const delivery = await deliver({ ...clientWelcomeTemplate(client), timeoutMs: Math.max(1000, Math.min(8000, deadline - Date.now())), to: job.email, template: "team_client_welcome", eventKey, entityType: "team_client", entityId: client.id });
      const prior = delivery.status === "duplicate_skipped" ? await prisma.emailLog.findUnique({ where: { eventKey } }) : null;
      const status = delivery.status === "sent" || prior?.status === "sent" ? "SENT" : delivery.status === "skipped" ? "PENDING" : "REVIEW";
      await prisma.teamClientWelcome.update({ where: { id: job.id }, data: { status, error: delivery.error || (status === "REVIEW" ? "Check the email log before an explicit manual retry." : null) } });
      if (status === "SENT") sent++;
    } catch {
      await prisma.teamClientWelcome.update({ where: { id: job.id }, data: { status: "REVIEW", error: "Check email logs before retrying; the delivery outcome may be ambiguous." } });
    }
  }
  return { sent, disabled: false };
}
