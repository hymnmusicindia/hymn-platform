import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { getUserSessionSecret } from "@/lib/env";
import { ACQUISITION_ATTRIBUTION_COOKIE } from "@/lib/acquisition-revenue";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  const { token } = await context.params;
  let claims: { purpose?: string; leadId?: string; employeeId?: string };
  try {
    const decoded = jwt.verify(token, getUserSessionSecret());
    if (typeof decoded === "string") throw new Error("Invalid token");
    claims = decoded as typeof claims;
  } catch {
    return NextResponse.redirect(new URL("/join", request.url));
  }
  if (claims.purpose !== "acquisition_lead" || !claims.leadId || !claims.employeeId) return NextResponse.redirect(new URL("/join", request.url));
  const lead = await prisma.acquisitionLead.findFirst({ where: { id: claims.leadId, acquisitionEmployeeId: claims.employeeId, prospect: { stage: { in: ["QUALIFIED", "READY_TO_CONTACT", "INTERESTED"] }, suppressed: false } }, select: { id: true, workspaceId: true } });
  const member = await prisma.teamMember.findFirst({ where: { id: claims.employeeId, status: "ACTIVE", workspaceId: lead?.workspaceId } });
  if (!lead || !member) return NextResponse.redirect(new URL("/join", request.url));
  await prisma.acquisitionClick.create({ data: { leadId: lead.id, employeeId: member.id, campaign: "employee_lead_link" } });
  const response = NextResponse.redirect(new URL("/join", request.url));
  response.cookies.set(ACQUISITION_ATTRIBUTION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return response;
}
