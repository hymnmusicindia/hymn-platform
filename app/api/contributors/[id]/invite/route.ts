import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { createContributorInvitation } from "@/lib/contributor-identity";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { emailAppUrl } from "@/lib/email/email-events";

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const partyId = Number((await context.params).id);
  if (!Number.isInteger(partyId) || partyId <= 0) return NextResponse.json({ error: "Invalid contributor identity." }, { status: 400 });
  try {
    const party = await prisma.contributorParty.findFirst({
      where: { id: partyId, mergedIntoId: null, OR: [{ createdByUserId: auth.user.id }, { claimedByUserId: auth.user.id }, { contributions: { some: { track: { release: { userId: auth.user.id } } } } }] },
      select: { id: true, professionalName: true }
    });
    if (!party) return NextResponse.json({ error: "You cannot invite someone for this contributor identity." }, { status: 403 });
    const body = await request.json();
    const { invitation, token } = await createContributorInvitation({ partyId, invitedByUserId: auth.user.id, email: String(body.email ?? "") });
    const claimUrl = emailAppUrl(`/contributors/claim?token=${encodeURIComponent(token)}`);
    await sendTransactionalEmail({
      to: invitation.email,
      subject: `Claim your ${party.professionalName} contributor identity on HYMN`,
      template: "contributor_invitation",
      eventKey: `contributor:${party.id}:invite:${invitation.id}`,
      entityType: "contributor_party",
      entityId: party.id,
      text: `${auth.user.name} invited you to claim the existing ${party.professionalName} contributor identity on HYMN. Claim it securely: ${claimUrl}`,
      html: `<p>${escapeHtml(auth.user.name)} invited you to claim the existing <strong>${escapeHtml(party.professionalName)}</strong> contributor identity on HYMN.</p><p><a href="${escapeHtml(claimUrl)}">Claim contributor identity</a></p><p>This invitation expires in 7 days.</p>`
    });
    return NextResponse.json({ success: true, expiresAt: invitation.expiresAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not invite contributor." }, { status: 400 });
  }
}
