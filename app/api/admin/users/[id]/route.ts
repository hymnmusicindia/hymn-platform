import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { createNotification, updateUserRole } from "@/lib/db";
import { userRoleUpdateSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdminPermission("users.manage");
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const payload = userRoleUpdateSchema.parse(await request.json());
    const user = await updateUserRole(Number(id), payload.role);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (payload.role === "producer") {
      await prisma.producerProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, slug: `${user.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "producer"}-${user.id}`, displayName: user.name, bio: "", specialty: "Music producer", status: "pending_setup", active: true },
        update: { active: true, status: "pending_setup" }
      });
      await createNotification({ userId: user.id, title: "Producer access enabled", body: "You can now access your Producer Dashboard from your HYMN dashboard.", type: "account", href: "/producer/dashboard", actionLabel: "Open Producer Dashboard", eventKey: `producer:${user.id}:role-enabled` });
    } else {
      await prisma.producerProfile.updateMany({ where: { userId: user.id }, data: { active: false, status: "disabled" } });
    }
    await prisma.auditLog.create({ data: { actorId: "sub" in result ? result.sub : null, action: payload.role === "producer" ? "PRODUCER_ROLE_GRANTED" : "PRODUCER_ROLE_REVOKED", entity: "user", entityId: String(user.id), metadata: { role: payload.role } } });
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
// vercel trigger 7
// vercel trigger 9

// vercel trigger 11
