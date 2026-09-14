import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const admin = await requireAdminPermission("users.manage");
  if ("error" in admin) return admin.error;
  try {
    const input = z.object({ id: z.number().int().positive(), status: z.enum(["new", "contacted", "qualified", "converted", "closed"]), notes: z.string().max(5000), assignedTo: z.number().int().positive().nullable().optional() }).parse(await request.json());
    await prisma.$transaction(async tx => {
      const previous = await tx.growthLead.findUniqueOrThrow({ where: { id: input.id } });
      if (input.assignedTo) {
        const assignee = await tx.adminMembership.findUnique({ where: { userId: input.assignedTo } });
        if (!assignee?.active || assignee.revokedAt) throw new Error("Invalid assignee");
      }
      await tx.growthLead.update({ where: { id: input.id }, data: { status: input.status, notes: input.notes, assignedTo: input.assignedTo } });
      await tx.auditLog.create({ data: { actorType: "admin", actorId: "sub" in admin ? Number(admin.sub) : null, action: "GROWTH_LEAD_UPDATED", entity: "growth_lead", entityId: String(input.id), metadata: { previousStatus: previous.status, status: input.status, previousNotes: previous.notes, notes: input.notes, assignedTo: input.assignedTo ?? null } } });
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not update inquiry." }, { status: 400 }); }
}
