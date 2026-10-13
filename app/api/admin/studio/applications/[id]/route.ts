import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { appointStudioEngineer } from "@/lib/admin-studio-engineers";
import { engineerSlug } from "@/lib/engineer-applications";
import { apiRequestId } from "@/lib/api-response";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { getPublicAppUrl } from "@/lib/public-app-url";

const schema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().trim().max(500).optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("services.manage");
  if ("error" in admin) return admin.error;
  const id = Number((await params).id), parsed = schema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(id) || id < 1 || !parsed.success) return NextResponse.json({ error: "Choose a valid decision." }, { status: 400 });
  if (parsed.data.decision === "REJECT" && !parsed.data.note) return NextResponse.json({ error: "Add one clear improvement for the applicant." }, { status: 400 });
  const application = await prisma.engineerApplication.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, email: true, avatar: true } } } });
  if (!application) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (application.status === "APPROVED") return NextResponse.json({ success: true, status: "APPROVED" });
  const actorId = "sub" in admin ? Number(admin.sub) || null : null;
  let profileId: number | null = null;
  if (parsed.data.decision === "APPROVE") {
    const existingProfile = await prisma.engineerProfile.findFirst({ where: { contributorParty: { claimedByUserId: application.userId } }, select: { id: true } });
    const profile = existingProfile ?? await appointStudioEngineer({
      userId: application.userId, professionalName: application.professionalName, slug: engineerSlug(application.professionalName, application.userId), profilePhotoUrl: application.user.avatar, bio: application.bio, specialties: application.specialties, genres: application.genres,
      socialLinks: { instagram: application.instagramUrl, youtube: null }, portfolioItems: [{ title: "Featured work", url: application.portfolioUrl }], availability: "AVAILABLE", maxActiveOrders: 3, verificationState: "VERIFIED", sellerState: "ACTIVE", payoutState: "NOT_CONFIGURED",
      listing: { title: `${application.professionalName} · Mix & Master`, description: application.bio, standardPrice: Number(application.startingPrice), beatCustomerPrice: null, includedRevisions: 2, additionalRevisionPrice: 399, turnaroundDays: application.turnaroundDays, sourceRequirements: ["Consolidated stems or multitracks", "Rough reference mix", "Tempo and sample rate"], deliverables: ["24-bit WAV master", "320 kbps MP3"], instantAccept: false, active: true, paused: false },
    }, actorId, apiRequestId(request));
    profileId = profile.id;
  }
  const status = parsed.data.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  await prisma.engineerApplication.update({ where: { id }, data: { status, reviewNote: parsed.data.note || null, reviewedById: actorId, reviewedAt: new Date() } });
  await prisma.notification.upsert({ where: { eventKey: `studio:engineer-application:${id}:${status}` }, create: { userId: application.userId, title: status === "APPROVED" ? "You’re now a HYMN Studio engineer" : "Your engineer application needs another pass", body: status === "APPROVED" ? "Your public gig and engineer workspace are ready." : parsed.data.note || "Update your profile or work sample, then apply again.", href: status === "APPROVED" ? "/studio/engineer" : "/studio/apply", actionLabel: status === "APPROVED" ? "Open workspace" : "Update application", eventKey: `studio:engineer-application:${id}:${status}` }, update: {} });
  after(async () => {
    const approved = status === "APPROVED";
    const message = { title: approved ? "Welcome to HYMN Studio" : "Your engineer application needs an update", greeting: `Hi ${application.user.name},`, body: approved ? "Your engineer profile and first mixing/mastering gig are live. You can now receive and manage Studio projects." : parsed.data.note || "Update your application and work sample, then send it back for review.", ctaLabel: approved ? "Open engineer workspace" : "Update application", ctaUrl: `${getPublicAppUrl()}${approved ? "/studio/engineer" : "/studio/apply"}` };
    await sendTransactionalEmail({ to: application.user.email, userId: application.userId, subject: message.title, template: `engineer_application_${status.toLowerCase()}`, eventKey: `studio:engineer-application:${id}:${status}:email`, entityType: "engineer_application", entityId: id, html: emailLayout(message), text: emailText(message) });
  });
  return NextResponse.json({ success: true, status, profileId });
}
