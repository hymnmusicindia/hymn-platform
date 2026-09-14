import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { growthContext, growthEnabled, recordGrowthEvent } from "@/lib/growth";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";

const schema = z.object({
  name: z.string().trim().min(2).max(120), email: z.string().email().max(254),
  phone: z.string().max(40).optional(), company: z.string().max(160).optional(),
  serviceInterest: z.string().max(120).optional(), collaborationType: z.string().max(120).optional(),
  message: z.string().trim().min(10).max(5000), website: z.string().max(200).optional()
});

export async function receiveGrowthLead(request: Request, kind: "contact" | "partner") {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  try {
    const rate = await consumeRateLimit({ scope: `lead.${kind}`, identity: requestIdentity(request), limit: 10, windowSeconds: 600 });
    if (!rate.allowed) return NextResponse.json({ error: "Please wait before sending another request." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const raw = await request.text();
    if (raw.length > 12000) return NextResponse.json({ error: "Message is too large." }, { status: 413 });
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) return NextResponse.json({ error: "Please check your name, email and message." }, { status: 400 });
    const data = parsed.data;
    if (data.website) return NextResponse.json({ success: true }, { status: 201 });
    const session = await getSession();
    const visitor = growthEnabled() ? await growthContext(session?.sub).catch(() => null) : null;
    const lead = await prisma.growthLead.create({ data: {
      kind, name: data.name, email: data.email, phone: data.phone, company: data.company,
      interest: data.serviceInterest || data.collaborationType || "Other", message: data.message,
      userId: session?.sub, visitorId: visitor?.id,
      attribution: visitor ? { first_touch: visitor.firstTouch, last_touch: visitor.lastTouch } : undefined
    } });
    await recordGrowthEvent({ event: kind === "contact" ? "contact_inquiry_submitted" : "partner_application_submitted", key: `lead:${lead.id}`, userId: session?.sub });
    return NextResponse.json({ success: true, id: lead.id }, { status: 201 });
  } catch { return NextResponse.json({ error: "Your request could not be saved. Please try again." }, { status: 503 }); }
}
