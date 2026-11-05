import { after, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { getSession } from "@/lib/session";
import { isSameAppOrigin } from "@/lib/request-origin";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { emailLayout, emailText } from "@/lib/email/email-templates";
import { sendTransactionalEmail } from "@/lib/email/send-transactional-email";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { consultationAvailability, consultationProfile, ConsultationPortalError, submitConsultation } from "@/lib/consultation-portal";

export const runtime = "nodejs";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function failure(error: unknown) {
  if (error instanceof ConsultationPortalError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof ZodError) return NextResponse.json({ error: "Check each step and provide the requested consultation details." }, { status: 400, headers });
  if (error instanceof Error && error.message === "Enter a valid phone number with its country code.") return NextResponse.json({ error: error.message }, { status: 400, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Your consultation request was already received. Refresh to see its current status." }, { status: 409, headers });
  console.error("CONSULTATION_REQUEST_FAILED", { name: error instanceof Error ? error.name : "UnknownError" });
  return NextResponse.json({ error: "We could not complete your consultation request. Your information has not been confirmed; please try again." }, { status: 503, headers });
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in to HYMN to continue." }, { status: 401, headers });
    await consultationProfile(session.sub);
    const mode = new URL(request.url).searchParams.get("mode");
    if (mode === "profile") return NextResponse.json({ account: await consultationProfile(session.sub) }, { headers });
    if (mode === "slots") {
      const limit = await consumeRateLimit({ scope: "consultation-slots", identity: requestIdentity(request), limit: 30, windowSeconds: 60 });
      if (!limit.allowed) return NextResponse.json({ error: "Too many availability checks. Please wait a moment." }, { status: 429, headers });
      return NextResponse.json(await consultationAvailability(), { headers });
    }
    return NextResponse.json({ error: "Choose an available consultation action." }, { status: 400, headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON content required." }, { status: 415, headers });
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 32000) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Your HYMN session expired. Sign in again to continue." }, { status: 401, headers });
    const [ipLimit, userLimit] = await Promise.all([
      consumeRateLimit({ scope: "consultation-submit-ip", identity: requestIdentity(request), limit: 8, windowSeconds: 3600 }),
      consumeRateLimit({ scope: "consultation-submit-user", identity: String(session.sub), limit: 4, windowSeconds: 3600 })
    ]);
    if (!ipLimit.allowed || !userLimit.allowed) return NextResponse.json({ error: "You’ve reached the consultation request limit. Please try again later." }, { status: 429, headers });
    const text = await request.text();
    if (text.length > 32000) return NextResponse.json({ error: "Request too large." }, { status: 413, headers });
    let body: unknown;
    try { body = JSON.parse(text); }
    catch { return NextResponse.json({ error: "Send valid consultation details." }, { status: 400, headers }); }
    const result = await submitConsultation(session.sub, body);
    if (!result.duplicate) {
      if (result.appointmentEventId) {
        const eventId = result.appointmentEventId;
        after(async () => { await (await import("@/lib/team/appointments")).processAppointments(eventId, 4); });
      } else {
        const email = {
          title: "We received your HYMN consultation request",
          greeting: `Hi ${result.fullName},`,
          body: `Thank you for sharing what you are working toward. The HYMN team has received your consultation request and will contact you shortly at ${result.phone}.`,
          ctaLabel: "Visit HYMN",
          ctaUrl: getPublicAppUrl()
        };
        after(async () => {
          const delivery = await sendTransactionalEmail({
            to: result.email,
            subject: email.title,
            template: "consultation_request",
            html: emailLayout(email),
            text: emailText(email),
            eventKey: `consultation:${result.id}:confirmation`,
            userId: session.sub,
            entityType: "consultation_request",
            entityId: result.id
          });
          if (!["sent", "duplicate_skipped"].includes(delivery.status)) console.error("CONSULTATION_CONFIRMATION_EMAIL_NOT_SENT", { consultationId: result.id, status: delivery.status });
        });
      }
    }
    const publicResult = {
      id: result.id,
      duplicate: result.duplicate,
      fullName: result.fullName,
      email: result.email,
      phone: result.phone,
      interests: result.interests,
      preferredCallback: result.preferredCallback,
      status: result.status,
      assigned: result.assigned
    };
    return NextResponse.json(publicResult, { status: result.duplicate ? 200 : 201, headers });
  } catch (error) {
    return failure(error);
  }
}
