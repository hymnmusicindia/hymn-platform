import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/session";
import { adminLoginSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = adminLoginSchema.parse(await request.json());
    if (payload.username !== "admin" || payload.password !== "admin") {
      return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
    }

    await createAdminSession();
    return NextResponse.json({ redirectPath: "/admin" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin authentication failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


