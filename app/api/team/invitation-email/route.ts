import { isSameAppOrigin } from "@/lib/request-origin";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { teamActor } from "@/lib/team/access";
import { teamWrite, audit } from "@/lib/team/service";
import { demand, TeamError } from "@/lib/team/policy";
import { getEmailClient, getEmailConfig } from "@/lib/email/email-client";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { consumeRateLimit } from "@/lib/rate-limit";
import { emailLayout, emailText } from "@/lib/email/email-templates";
export async function POST(request: Request) {
  try {
    if (!isSameAppOrigin(request)) throw new TeamError("Same-origin request required.", 403);
    const a = await teamActor(new URL(request.url).searchParams.get("workspace") || undefined); demand(a, "team.members.invite");
    if (!(await consumeRateLimit({ scope: "team-invite-email", identity: a.id, limit: 10, windowSeconds: 3600 })).allowed) throw new TeamError("Invitation mail limit reached.", 429);
    const input = z.object({ id: z.string().max(80), token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(await request.json());
    const invite = await teamWrite(a, async (tx, actor) => {
      demand(actor, "team.members.invite"); const item = await tx.teamInvitation.findFirst({ where: { id: input.id, workspaceId: actor.workspaceId }, include: { role: true } });
      if (!item || item.acceptedAt || item.revokedAt || item.expiresAt < new Date() || item.role.owner || !timingSafeEqual(Buffer.from(item.tokenHash, "hex"), createHash("sha256").update(input.token).digest())) throw new TeamError("Invitation unavailable.", 403);
      if (!actor.role.owner && item.role.permissions.some(p => !actor.role.permissions.includes(p) || ["team.members.manage", "team.members.invite", "settings.manage"].includes(p))) throw new TeamError("Only the owner can deliver this invitation.", 403);
      return item;
    });
    const client = getEmailClient({ timeoutMs: 15000 }); const config = getEmailConfig();
    if (!client) return Response.json({ status: "skipped", message: "Email is not configured. Share the secure invitation link instead." });
    const href = `${getPublicAppUrl()}/team/join#token=${input.token}`;
    const template = { title: "Your invitation to HYMN Team OS", greeting: "Hello from the HYMN team,", body: `You have been invited to join HYMN as ${invite.role.name}. One workspace. Every team. Every project. Sign into the HYMN account receiving this email to accept.`, ctaLabel: "Accept team invitation", ctaUrl: href, notice: "This invitation expires in 72 hours. Internal membership does not grant platform-admin, banking, payout or payment authority." };
    const html = emailLayout(template);
    // Do not place the secret invitation URL in persisted email-log payloads.
    const result = await client.emails.send({ from: config.from, to: invite.email, subject: "Your invitation to HYMN Team OS", html, text: emailText(template), replyTo: config.replyTo });
    if (result.error) throw new TeamError("The email provider did not accept this invitation.", 502);
    await teamWrite(a, (tx, actor) => audit(tx, actor, "invitation.email_accepted", invite.id));
    return Response.json({ status: "provider_accepted", message: "The email provider accepted the invitation. Inbox delivery is not guaranteed." });
  } catch (error) { return Response.json({ error: error instanceof TeamError ? error.message : "Invitation mail failed. The secure link remains available." }, { status: error instanceof TeamError ? error.status : 503 }); }
}
