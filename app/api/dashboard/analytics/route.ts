import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getAnalyticsByUserId } from "@/lib/db";

export async function GET() {
  const user = await requireUser();
  if ("error" in user) return user.error;
  return NextResponse.json({ analytics: await getAnalyticsByUserId(user.user.id) });
}
