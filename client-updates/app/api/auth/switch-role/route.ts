import { NextResponse } from "next/server";
import { destinationForRole } from "@/lib/access";
import { createSession, getSession } from "@/lib/session";
import { updateUserRole } from "@/lib/db";
import { workspaceRoleSwitchSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const payload = workspaceRoleSwitchSchema.parse(await request.json());
    const user = await updateUserRole(session.sub, payload.role);

    if (!user) {
      return NextResponse.json({ error: "Could not switch role." }, { status: 404 });
    }

    await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
    return NextResponse.json({ user, redirectPath: destinationForRole(user.role) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not switch role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
