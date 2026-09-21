import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { claimContributorInvitation } from "@/lib/contributor-identity";

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const body = await request.json();
    const party = await claimContributorInvitation({ token: String(body.token ?? ""), userId: auth.user.id, verifiedEmail: auth.user.email });
    return NextResponse.json({ success: true, contributor: { id: party.id, publicId: party.publicId, professionalName: party.professionalName } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not claim contributor identity." }, { status: 400 });
  }
}
