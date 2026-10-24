import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { emailLayout, emailText } from '@/lib/email/email-templates';
import { getPublicAppUrl } from '@/lib/public-app-url';
import type { Actor } from './policy';

export const CALL_ESTABLISHED_TEMPLATE = 'call_established';
export function callEstablishedTemplate(name: string) {
  const model = {
    title: 'Thank you for speaking with HYMN',
    greeting: `Hi ${name.trim() || 'there'},`,
    body: 'Thank you for taking the time to speak with our HYMN customer helpline. We hope our conversation was helpful.\n\nIf you have any doubts, questions or need further assistance, simply reply to this email. Our team will be happy to help.\n\nTo explore our music tools and services, visit HYMN Music and log in to your account. You can also create an account if you are new to HYMN.\n\nWarm regards,\nHYMN Customer Support',
    ctaLabel: 'Log in to HYMN Music',
    ctaUrl: `${getPublicAppUrl()}/login`,
  };
  const footer = 'This message follows your conversation with the HYMN customer helpline.';
  return { subject: 'Thank you for speaking with HYMN Customer Support', html: emailLayout(model).replace('This transactional message relates to your HYMN account, purchase or release.', footer), text: emailText(model).replace('This transactional message relates to your HYMN account, purchase or release.', footer) };
}

/** Durable job in the existing email outbox; one acknowledgement per callback. */
export async function queueCallEstablishedEmail(tx: Prisma.TransactionClient, a: Actor, task: { id: string; clientId: string | null }) {
  if (!task.clientId) return null;
  const requestKey = `call-established:${task.id}`;
  const prior = await tx.teamOutreachEmail.findUnique({ where: { requestKey } });
  if (prior) return { id: prior.id, status: prior.status };
  const client = await tx.teamClient.findUniqueOrThrow({ where: { id: task.clientId } });
  const usable = z.string().email().safeParse(client.email).success;
  const template = callEstablishedTemplate(client.name);
  const row = await tx.teamOutreachEmail.create({ data: { workspaceId: a.workspaceId, memberId: a.id, clientId: client.id, requestKey, template: CALL_ESTABLISHED_TEMPLATE, recipient: client.email.toLowerCase(), subject: template.subject, body: template.text, senderName: 'HYMN Customer Support', senderRole: 'Customer helpline', status: usable && client.status === 'ACTIVE' ? 'QUEUED' : 'SKIPPED', error: !usable ? 'No usable email address saved. Call remains marked as talked.' : client.status !== 'ACTIVE' ? 'Contact is inactive or opted out.' : null } });
  return { id: row.id, status: row.status };
}
