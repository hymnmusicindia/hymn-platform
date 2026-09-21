import { NextResponse } from "next/server";
import { requireRecentAdminPermission } from "@/lib/access";
import { mergeContributorParties } from "@/lib/contributor-identity";

export async function POST(request: Request) {
  const admin = await requireRecentAdminPermission("users.manage");
  if ("error" in admin) return admin.error;
  try {
    const body = await request.json();
    const evidence = body.evidence && typeof body.evidence === "object" ? body.evidence : {};
    const result = await mergeContributorParties({ sourcePartyId: Number(body.sourcePartyId), targetPartyId: Number(body.targetPartyId), adminUserId: "sub" in admin ? Number(admin.sub) : null, evidence });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not merge contributor identities." }, { status: 400 });
  }
}
