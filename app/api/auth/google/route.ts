import { NextResponse } from "next/server";
import { destinationForRole } from "@/lib/access";
import { profileAvatarDataUrl } from "@/lib/avatar";
import { createSession } from "@/lib/session";
import { upsertGoogleUser } from "@/lib/db";
import { verifyGoogleCredential } from "@/lib/google-auth";
import { googleAuthSchema } from "@/lib/validation";
import { createBirthdayNotificationForUser } from "@/lib/onboarding";

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

    if (payload.loginContext === "admin" && user.role !== "admin") {
      return NextResponse.json(
        { error: "This Google account is not approved for admin access. Add its email to ADMIN_GOOGLE_EMAILS or assign the admin role first." },
        { status: 403 }
      );
    }

    await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: profile.picture || profileAvatarDataUrl(user.name, user.role) });
    await createBirthdayNotificationForUser(user.id).catch((error) => console.error("Birthday notification check failed", error));
    const redirectPath = payload.loginContext === "admin" ? "/admin" : destinationForRole(user.role);
    return NextResponse.json({ user, redirectPath });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google authentication failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger 3
