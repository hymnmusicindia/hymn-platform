import { NextResponse } from "next/server";
import { destinationForRole } from "@/lib/access";
import { profileAvatarDataUrl } from "@/lib/avatar";
import { ensureMockUser } from "@/lib/db";
import { createSession } from "@/lib/session";
import { mockLoginSchema } from "@/lib/validation";

const mockLoginEnabled =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_MOCK_LOGIN === "true" ||
  process.env.NEXT_PUBLIC_ENABLE_MOCK_LOGIN === "true";

export async function POST(request: Request) {
  if (!mockLoginEnabled) {
    return NextResponse.json({ error: "Mock login is disabled." }, { status: 404 });
  }

  try {
    const payload = mockLoginSchema.parse(await request.json());
    const user = await ensureMockUser(payload.role);

    if (!user) {
      return NextResponse.json({ error: "Could not open the demo account." }, { status: 500 });
    }

    await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: profileAvatarDataUrl(user.name, user.role) });

    return NextResponse.json({ user, redirectPath: destinationForRole(user.role) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mock login failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
