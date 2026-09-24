import { requireAdminPermission } from "@/lib/access";
import { studioEngineerInputSchema, updateStudioEngineer } from "@/lib/admin-studio-engineers";
import { apiFailure, apiRequestId, apiSuccess } from "@/lib/api-response";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = apiRequestId(request);
  const admin = await requireAdminPermission("services.manage");
  if ("error" in admin) return admin.error;
  const profileId = Number((await context.params).id);
  if (!Number.isInteger(profileId) || profileId < 1) return apiFailure(requestId, "INVALID_ENGINEER", "Invalid engineer profile.", 400);
  const parsed = studioEngineerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiFailure(requestId, "INVALID_ENGINEER", parsed.error.issues[0]?.message || "Invalid engineer details.", 400, parsed.error.flatten().fieldErrors);
  try {
    const profile = await updateStudioEngineer(profileId, parsed.data, "sub" in admin ? Number(admin.sub) || null : null, requestId);
    return apiSuccess(requestId, { id: profile.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update engineer.";
    return apiFailure(requestId, "ENGINEER_UPDATE_FAILED", message.includes("Unique constraint") ? "That engineer slug is already in use." : message, message.includes("not found") ? 404 : 400);
  }
}
