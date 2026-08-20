import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { destinationForRole } from "@/lib/access";
import { profileAvatarDataUrl } from "@/lib/avatar";
import { createPasswordUser } from "@/lib/db";
import { createSession } from "@/lib/session";
import { userSignupSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = userSignupSchema.parse(await request.json());
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await createPasswordUser({
      name: payload.name,
      email: payload.email,
      passwordHash,
      role: payload.role,
      referralCode: payload.referralCode
    });

    if (!user) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: profileAvatarDataUrl(user.name, user.role) });
    return NextResponse.json({ user, redirectPath: destinationForRole(user.role) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign up failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
