import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { generateBeatLicense } from "@/lib/beat-license";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("users.manage"); if ("error" in admin) return admin.error;
  try { return NextResponse.json(await generateBeatLicense(Number((await params).id), "sub" in admin ? admin.sub : 0, true)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not regenerate license." }, { status: 400 }); }
}
// vercel trigger 9
