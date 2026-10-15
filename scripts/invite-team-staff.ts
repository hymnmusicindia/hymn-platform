import { prisma } from "../lib/prisma";
import { teamMutation } from "../lib/team/service";
import { getEmailClient, getEmailConfig } from "../lib/email/email-client";
import { emailLayout, emailText } from "../lib/email/email-templates";
import { getPublicAppUrl } from "../lib/public-app-url";
// Exact existing account emails confirmed by the operator; never infer access by name.
const staff = [
  { email: "relhantavish22@gmail.com", name: "Tavish", role: "Growth Executive", department: "Growth & Client Success", jobTitle: "Artist Growth & Client Operations" },
  { email: "manhadakora5@gmail.com", name: "Manha", role: "Marketplace Executive", department: "Marketplace & Creator Success", jobTitle: "Beat Marketplace & Creator Operations" },
];
async function main() {
  const ownerEmail = process.argv[process.argv.indexOf("--owner-email") + 1];
  if (!ownerEmail || !process.argv.includes("--owner-email")) throw Error("Explicit --owner-email required");
  const owner = await prisma.teamMember.findFirst({ where: { status: "ACTIVE", role: { owner: true }, user: { email: ownerEmail, status: "ACTIVE" } }, include: { role: true } });
  if (!owner) throw Error("Active Team OS owner required");
  const client = getEmailClient({ timeoutMs: 15000 }); const config = getEmailConfig();
  if (process.argv.includes("--apply") && !client) throw Error("Email is unavailable; use the authenticated invitation UI instead.");
  for (const person of staff) {
    const user = await prisma.user.findUnique({ where: { email: person.email } }); if (!user || user.status !== "ACTIVE") throw Error("Verified staff account is no longer active");
    if (await prisma.teamMember.findUnique({ where: { workspaceId_userId: { workspaceId: owner.workspaceId, userId: user.id } } })) { console.log(`${person.name}: existing membership preserved`); continue; }
    if (await prisma.teamInvitation.findFirst({ where: { workspaceId: owner.workspaceId, email: person.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } })) { console.log(`${person.name}: existing pending invitation preserved`); continue; }
    const role = await prisma.teamRole.findFirstOrThrow({ where: { workspaceId: owner.workspaceId, name: person.role, owner: false } });
    if (!process.argv.includes("--apply")) { console.log(`${person.name}: prepare ${person.role} invitation (preview only)`); continue; }
    const invitation = await teamMutation(owner, "invites", { email: person.email, roleId: role.id, department: person.department, jobTitle: person.jobTitle }) as { id: string; token: string };
    const template = { title: "Welcome to HYMN Team OS", greeting: `Hi ${person.name},`, body: `Your HYMN team workspace is ready. Join as ${person.jobTitle} to manage your assigned work, collaborate with the team, and coordinate real HYMN projects. Sign into your existing HYMN account using this email address to accept.`, ctaLabel: "Join Team Workspace", ctaUrl: `${getPublicAppUrl()}/team/join#token=${invitation.token}`, notice: "This invitation expires in 72 hours. Access activates only after your authenticated acceptance. Internal permissions do not grant platform-admin, payment or banking authority." };
    const result = await client!.emails.send({ from: config.from, replyTo: config.replyTo, to: person.email, subject: "Your HYMN Team OS invitation", html: emailLayout(template), text: emailText(template) }).catch(async () => { await teamMutation(owner, "invite-revoke", { id: invitation.id }); throw Error("Invitation delivery failed; invitation revoked. Check provider configuration and retry."); });
    if (result.error) { await teamMutation(owner, "invite-revoke", { id: invitation.id }); throw Error("Provider rejected invitation delivery; invitation revoked. Retry safely."); }
    console.log(`${person.name}: invitation accepted by email provider; inbox delivery is not guaranteed.`);
    await prisma.teamAudit.create({ data: { workspaceId: owner.workspaceId, actorId: owner.id, action: "invitation.email_provider_accepted", entityId: invitation.id, detail: { providerMessageId: result.data?.id || null } } });
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Staff invitation failed"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
