import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { updateUserRole } from "@/lib/db";
import { userRoleUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const { id } = await params;

  try {
    const payload = userRoleUpdateSchema.parse(await request.json());
    const user = await updateUserRole(Number(id), payload.role);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
