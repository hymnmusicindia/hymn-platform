import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getUserEntitlements } from "@/lib/entitlements";

export async function GET() {
  const result = await requireUser();
  if ("error" in result) return result.error;
  return NextResponse.json(await getUserEntitlements(result.session.sub));
}
