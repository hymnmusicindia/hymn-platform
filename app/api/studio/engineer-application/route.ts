import { after, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { engineerApplicationSchema } from "@/lib/engineer-applications";
import { createNotificationOnce } from "@/lib/notifications";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { getPublicAppUrl } from "@/lib/public-app-url";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in to apply." }, { status: 401 });
  const parsed = engineerApplicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check your application." }, { status: 400 });
  const existingProfile = await prisma.engineerProfile.findFirst({ where: { contributorParty: { claimedByUserId: session.sub } }, select: { id: true } });
  if (existingProfile) return NextResponse.json({ error: "Your engineer workspace is already active." }, { status: 409 });
  const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { id: true, name: true, email: true, status: true } });
  if (!user || user.status !== "ACTIVE") return NextResponse.json({ error: "Your account must be active to apply." }, { status: 403 });
  const application = await prisma.engineerApplication.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data, profileExtras: parsed.data.profileExtras ?? undefined, instagramUrl: parsed.data.instagramUrl || null },
    update: { ...parsed.data, profileExtras: parsed.data.profileExtras ?? undefined, instagramUrl: parsed.data.instagramUrl || null, status: "PENDING", reviewNote: null, reviewedAt: null, reviewedById: null },
    select: { id: true, updatedAt: true },
  });
  await prisma.auditLog.create({ data: { actorId: user.id, actorType: "user", actorRole: session.role, action: "STUDIO_ENGINEER_APPLICATION_SUBMITTED", entity: "engineer_application", entityId: String(application.id), metadata: { specialties: parsed.data.specialties, genres: parsed.data.genres } } });
  await createNotificationOnce({ eventKey: `studio:engineer-application:${application.id}:${application.updatedAt.getTime()}`, userId: user.id, title: "Engineer application received", body: "HYMN will review your profile and work sample.", type: "account", href: "/studio/apply", actionLabel: "View application" });
  after(async () => {
    const message = { title: "We received your engineer application", greeting: `Hi ${user.name},`, body: "Your HYMN Studio application is now in review. We will notify you here and by email after the review.", ctaLabel: "View application", ctaUrl: `${getPublicAppUrl()}/studio/apply` };
    await sendTransactionalEmail({ to: user.email, userId: user.id, subject: "Your HYMN Studio application is in review", template: "engineer_application_submitted", eventKey: `studio:engineer-application:${application.id}:${application.updatedAt.getTime()}:email`, entityType: "engineer_application", entityId: application.id, html: emailLayout(message), text: emailText(message) });
  });
  return NextResponse.json({ success: true, applicationId: application.id });
}
