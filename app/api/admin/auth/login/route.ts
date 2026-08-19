import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/session";
import { adminLoginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = adminLoginSchema.parse(await request.json());
    const devUsername = process.env.ADMIN_DEV_USERNAME?.trim();
    const devPassword = process.env.ADMIN_DEV_PASSWORD?.trim();
    const devLoginEnabled = process.env.NODE_ENV !== "production" && devUsername && devPassword;

    if (!devLoginEnabled || payload.username !== devUsername || payload.password !== devPassword) {
      return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
    }

    await createAdminSession();
    return NextResponse.json({ redirectPath: "/admin" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin authentication failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}



// vercel trigger
