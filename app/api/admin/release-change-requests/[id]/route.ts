import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { reviewReleaseChangeRequest } from "@/lib/release-change-requests";
import { prisma } from "@/lib/prisma";

const schema = z.object({ decision: z.enum(["approved", "information_required", "rejected", "processing_manually", "submitted_to_partner", "completed", "failed"]), note: z.string().trim().min(3).max(2000), providerReference: z.string().trim().max(200).optional() });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const current = await prisma.releaseChangeRequest.findUnique({ where: { id }, select: { requestType: true } });
  if (!current) return NextResponse.json({ error: "Change request not found." }, { status: 404 });
  const admin = await requireAdminPermission(current.requestType === "takedown" ? "takedowns.review" : "updates.review"); if ("error" in admin) return admin.error;
  try { const body = schema.parse(await request.json()); return NextResponse.json({ request: await reviewReleaseChangeRequest({ id, adminId: "sub" in admin ? Number(admin.sub) || null : null, ...body }) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Review failed." }, { status: 400 }); }
}
// vercel trigger 9
