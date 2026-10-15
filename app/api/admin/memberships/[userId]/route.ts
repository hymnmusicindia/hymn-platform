import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRecentAdminPermission } from "@/lib/access";
import { isAdminAuthority } from "@/lib/admin-role-policy";
import { changeAdministrator } from "@/lib/admin-membership-service";
import { isSameAppOrigin } from "@/lib/request-origin";
const schema = z.object({ role: z.enum(["super_admin", "qc_reviewer", "distribution_operator", "finance_operator", "payout_approver", "support_agent", "rights_operator", "read_only_auditor"]), active: z.boolean().default(true), reason: z.string().trim().min(5).max(1000) });
const revokeSchema = z.object({ nextRole: z.enum(["customer", "producer"]), reason: z.string().trim().min(5).max(1000) });
type Context = { params: Promise<{ userId: string }> };
async function mutate(request: Request, context: Context, revoke: boolean) {
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const admin = await requireRecentAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  if (!isAdminAuthority(admin.adminRole)) return NextResponse.json({ error: "Only a founder or super administrator can change platform access." }, { status: 403 });
  try {
    const actorId = "sub" in admin ? Number(admin.sub) : 0;
    const userId = Number((await context.params).userId);
    const body = revoke ? revokeSchema.parse(await request.json()) : schema.parse(await request.json());
    const membership = await changeAdministrator(actorId, userId, body);
    return NextResponse.json({ membership, ...("nextRole" in body ? { user: { id: userId, role: body.nextRole } } : {}) });
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? "Supply a valid role, account and reason (at least 5 characters)." : error instanceof Error ? error.message : "Membership update failed." }, { status: 400 }); }
}
export function PUT(request: Request, context: Context) { return mutate(request, context, false); }
export function DELETE(request: Request, context: Context) { return mutate(request, context, true); }
