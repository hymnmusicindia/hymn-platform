import { NextResponse } from "next/server";
import { destinationForRole } from "@/lib/access";
import { profileAvatarDataUrl } from "@/lib/avatar";
import { createSession } from "@/lib/session";
import { upsertGoogleUser } from "@/lib/db";
import { verifyGoogleCredential } from "@/lib/google-auth";
import { googleAuthSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = googleAuthSchema.parse(await request.json());
    const profile = await verifyGoogleCredential(payload.credential);
    const user = await upsertGoogleUser({
      name: profile.name,
      email: profile.email,
      googleId: profile.sub,
      referralCode: payload.referralCode,
      expectedRole: payload.expectedRole
    });

    if (!user) {
      return NextResponse.json({ error: "Could not open the Google account." }, { status: 500 });
    }

    await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: profile.picture || profileAvatarDataUrl(user.name, user.role) });
    return NextResponse.json({ user, redirectPath: destinationForRole(user.role) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google authentication failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
