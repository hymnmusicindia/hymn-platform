import { NextResponse } from "next/server";
import { requireRecentAdminPermission } from "@/lib/access";
import { createNotification, updateUserRole } from "@/lib/db";
import { userRoleUpdateSchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireRecentAdminPermission("users.manage");
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const body = await request.json();
    if (body.accountStatus) {
      const allowed = ["active", "paused", "under_review", "suspended", "deletion_scheduled", "banned"] as const;
      const accountStatus = String(body.accountStatus).toLowerCase() as typeof allowed[number];
      if (!allowed.includes(accountStatus)) return NextResponse.json({ error: "Invalid account status." }, { status: 400 });
      const reason = String(body.reason || "").trim();
      if (accountStatus !== "active" && reason.length < 3) return NextResponse.json({ error: "Add a reason for this account action." }, { status: 400 });
      const userId = Number(id);
      if ("sub" in result && Number(result.sub) === userId && accountStatus !== "active") return NextResponse.json({ error: "You cannot restrict your own admin account." }, { status: 409 });
      const now = new Date();
      const deletionScheduledAt = accountStatus === "deletion_scheduled" ? new Date(now.getTime() + 20 * 86_400_000) : null;
      const updated = await prisma.user.update({ where: { id: userId }, data: { status: accountStatus.toUpperCase() as any, statusReason: reason || null, statusChangedAt: now, deletionScheduledAt, ...(accountStatus === "active" ? { appealRequestedAt: null, appealMessage: null } : {}) } });
      if (accountStatus === "banned") await prisma.session.deleteMany({ where: { userId } });
      if (["suspended", "deletion_scheduled", "banned"].includes(accountStatus)) await prisma.producerProfile.updateMany({ where: { userId }, data: { active: false, status: "suspended" } });
      if (accountStatus === "active") await prisma.producerProfile.updateMany({ where: { userId, status: "suspended" }, data: { active: true, status: "active" } });
      await Promise.all([
        createNotification({ userId, title: accountStatus === "active" ? "Account cleared" : "Account status updated", body: accountStatus === "active" ? "Your account review is complete and your account is in good standing." : `${accountStatus.replaceAll("_", " ")}: ${reason}${deletionScheduledAt ? ` You may appeal before ${deletionScheduledAt.toLocaleDateString("en-IN")}.` : ""}`, type: "account", href: "/dashboard", eventKey: `account-status:${userId}:${now.getTime()}` }),
        prisma.auditLog.create({ data: { actorId: "sub" in result ? result.sub : null, action: "ACCOUNT_STATUS_CHANGED", entity: "user", entityId: String(userId), metadata: { accountStatus, reason, deletionScheduledAt } } })
      ]);
      return NextResponse.json({ user: { ...updated, role: updated.role.toLowerCase(), status: updated.status.toLowerCase(), avatarUrl: updated.avatar, createdAt: updated.createdAt.toISOString(), statusChangedAt: updated.statusChangedAt?.toISOString(), deletionScheduledAt: updated.deletionScheduledAt?.toISOString(), appealRequestedAt: updated.appealRequestedAt?.toISOString() } });
    }
    const payload = userRoleUpdateSchema.parse(body);
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
