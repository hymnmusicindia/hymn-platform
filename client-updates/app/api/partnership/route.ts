import { NextResponse } from "next/server";
import { createPartnershipLead } from "@/lib/db";
import { partnershipLeadSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const payload = partnershipLeadSchema.parse(await request.json());
    const lead = await createPartnershipLead(payload);
    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not store partnership lead.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


