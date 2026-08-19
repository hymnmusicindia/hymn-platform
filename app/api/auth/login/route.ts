import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { destinationForRole } from "@/lib/access";
import { profileAvatarDataUrl } from "@/lib/avatar";
import { findUserByEmail } from "@/lib/db";
import { createSession } from "@/lib/session";
import { userLoginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = userLoginSchema.parse(await request.json());
    const user = await findUserByEmail(payload.email);

    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (payload.role && payload.role !== user.role) {
      return NextResponse.json({ error: "This account uses a different workspace role." }, { status: 403 });
    }

    const valid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: profileAvatarDataUrl(user.name, user.role) });

    return NextResponse.json({ user, redirectPath: destinationForRole(user.role) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
