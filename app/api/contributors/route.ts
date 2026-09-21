import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { createContributorParty, searchContributorParties } from "@/lib/contributor-identity";

export async function GET(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.slice(0, 100) ?? "";
  return NextResponse.json({ contributors: await searchContributorParties(auth.user.id, query) });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  try {
    const body = await request.json();
    const party = await createContributorParty({
      createdByUserId: auth.user.id,
      professionalName: String(body.professionalName ?? ""),
      legalName: body.legalName ? String(body.legalName) : null,
      country: body.country ? String(body.country) : null,
      email: body.email ? String(body.email) : null,
      externalIdentifiers: body.ipi ? [{ scheme: "IPI", value: String(body.ipi) }] : []
    });
    return NextResponse.json({ contributor: { id: party.id, publicId: party.publicId, professionalName: party.professionalName, displayName: party.displayName, identityState: party.identityState } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create contributor identity." }, { status: 400 });
  }
}
