import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { listAdminTasks } from "@/lib/task-queue";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if ("error" in admin) return admin.error;
  const query = new URL(request.url).searchParams;
  return NextResponse.json({ tasks: await listAdminTasks({ status: query.get("status") ?? undefined, type: query.get("type") ?? undefined, priority: query.get("priority") ?? undefined }) });
}
