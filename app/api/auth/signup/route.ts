import { deliverReferralMail } from "@/lib/referral-mail";
import { Prisma } from "@prisma/client";
﻿import bcrypt from "bcrypt";
import { after, NextResponse } from "next/server";
import { destinationAfterLogin } from "@/lib/routes";
import { profileAvatarDataUrl } from "@/lib/avatar";
import { createPasswordUser } from "@/lib/db";
import { createSession } from "@/lib/session";
import { userSignupSchema } from "@/lib/validation";
import { cookies } from "next/headers";
import { REFERRAL_ATTRIBUTION_COOKIE } from "@/lib/referrals";

export async function POST(request: Request) {
  try {
    const payload = userSignupSchema.parse(await request.json());
    const cookieStore = await cookies();
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const user = await createPasswordUser({
      name: payload.name,
      email: payload.email,
      passwordHash,
      role: payload.role,
      referralCode: payload.referralCode || cookieStore.get(REFERRAL_ATTRIBUTION_COOKIE)?.value
    });

    if (!user) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    await createSession({ sub: user.id, email: user.email, name: user.name, role: user.role, avatarUrl: profileAvatarDataUrl(user.name, user.role) });
    cookieStore.delete(REFERRAL_ATTRIBUTION_COOKIE);
    after(() => deliverReferralMail().then(() => undefined));
    return NextResponse.json({ user, redirectPath: destinationAfterLogin(user.role) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError || error instanceof Prisma.PrismaClientUnknownRequestError) {
      console.error("Signup persistence failed", { code: "code" in error ? error.code : error.name });
      return NextResponse.json({ error: "We couldn't finish creating your account. Please try again." }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Sign up failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
