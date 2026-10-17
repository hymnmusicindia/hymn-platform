import { requireAdminPermission } from "@/lib/access";
import { cronHealthResponse } from "@/lib/cron/health";
export const runtime = "nodejs";

export async function GET() {
  const access = await requireAdminPermission("system.manage");
  if ("error" in access) return access.error;
  return cronHealthResponse();
}
