import { requireAdminPermission } from "@/lib/access";
import { appointStudioEngineer, studioEngineerInputSchema } from "@/lib/admin-studio-engineers";
import { apiFailure, apiRequestId, apiSuccess } from "@/lib/api-response";

export async function POST(request: Request) {
  const requestId = apiRequestId(request);
  const admin = await requireAdminPermission("services.manage");
  if ("error" in admin) return admin.error;
  const parsed = studioEngineerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiFailure(requestId, "INVALID_ENGINEER", parsed.error.issues[0]?.message || "Invalid engineer details.", 400, parsed.error.flatten().fieldErrors);
  try {
    const profile = await appointStudioEngineer(parsed.data, "sub" in admin ? Number(admin.sub) || null : null, requestId);
    return apiSuccess(requestId, { id: profile.id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not appoint engineer.";
    return apiFailure(requestId, "ENGINEER_APPOINTMENT_FAILED", message.includes("Unique constraint") ? "That engineer slug is already in use." : message, 400);
  }
}
