import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSessionSecret } from "@/lib/env";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };

function claimsFor(token: string) {
  const claims = jwt.verify(token, getUserSessionSecret());
  if (typeof claims === "string" || claims.purpose !== "acquisition_email_unsubscribe" || typeof claims.eventId !== "string" || typeof claims.prospectId !== "string") throw new Error("invalid token");
  return claims;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  try {
    const claims = claimsFor(token);
    const event = await prisma.acquisitionEmailEvent.findFirst({ where: { id: claims.eventId, prospectId: claims.prospectId, status: { in: ["QUEUED", "SENT"] } } });
    if (!event) return NextResponse.json({ message: "This unsubscribe link is invalid or expired." }, { status: 404, headers });
    return new NextResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Unsubscribe from HYMN Music</title></head><body><main><h1>Stop HYMN Music outreach?</h1><p>Confirm to suppress future email outreach to this address.</p><form method="post"><input type="hidden" name="token" value="${token.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"><button type="submit">Unsubscribe</button></form></main></body></html>`, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    return NextResponse.json({ message: "This unsubscribe link is invalid or expired." }, { status: 400, headers });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData(); const token = String(form.get("token") || ""); const claims = claimsFor(token);
    const event = await prisma.acquisitionEmailEvent.findFirst({ where: { id: claims.eventId, prospectId: claims.prospectId, status: { in: ["QUEUED", "SENT"] } } });
    if (!event) return NextResponse.json({ message: "This unsubscribe link is invalid or expired." }, { status: 404, headers });
    const updated = await prisma.teamProspect.updateMany({ where: { id: event.prospectId, workspaceId: event.workspaceId, suppressed: false }, data: { suppressed: true, contactEligibility: "DO_NOT_CONTACT", stage: "DO_NOT_CONTACT", version: { increment: 1 } } });
    if (updated.count) await prisma.acquisitionProgramAudit.create({ data: { workspaceId: event.workspaceId, actorEmployeeId: event.createdByEmployeeId, action: "email.unsubscribe_received", entityId: event.id, metadata: { prospectId: event.prospectId } } });
    return NextResponse.json({ message: "Unsubscribed. HYMN Music outreach to this contact is suppressed." }, { headers });
  } catch {
    return NextResponse.json({ message: "This unsubscribe link is invalid or expired." }, { status: 400, headers });
  }
}
