import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { retryTransactionalEmail } from "@/lib/email/send-transactional-email";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const { id } = await context.params;
  const logId = Number(id);
  if (!Number.isInteger(logId) || logId < 1) return NextResponse.json({ error: "Invalid email log id." }, { status: 400 });
  try { return NextResponse.json(await retryTransactionalEmail(logId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Email retry failed." }, { status: 400 }); }
}
// vercel trigger 6
// vercel trigger 9
