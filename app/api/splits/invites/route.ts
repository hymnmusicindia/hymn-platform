import { consumeRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { createSplitInvite } from "@/lib/splits";
export const runtime = "nodejs";
export async function POST(request: Request) {
    const auth = await requireUser();
    if ("error" in auth)
        return auth.error;
    const limit = await consumeRateLimit({ scope: "split-invite", identity: String(auth.user.id), limit: 120, windowSeconds: 3600 });
    if (!limit.allowed)
        return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    try {
        const invite = await createSplitInvite(auth.user.id, { splitRecordId: Number(body.splitRecordId), method: body.method === "split_code" ? "split_code" : "registered_email", recipientEmail: typeof body.recipientEmail === "string" ? body.recipientEmail : undefined, recipientHandle: typeof body.recipientHandle === "string" ? body.recipientHandle : undefined, recipientName: typeof body.recipientName === "string" ? body.recipientName : undefined, contributorPartyId: Number.isInteger(Number(body.contributorPartyId)) && Number(body.contributorPartyId) > 0 ? Number(body.contributorPartyId) : undefined, role: String(body.role || ""), sharePercent: Number(body.sharePercent), payoutEligible: body.payoutEligible !== false, note: typeof body.note === "string" ? body.note : undefined });
        return NextResponse.json({ invite }, { status: 201 });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create invite." }, { status: 400 });
    }
}
