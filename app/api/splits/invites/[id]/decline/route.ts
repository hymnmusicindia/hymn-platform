import { consumeRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { respondToSplitInvite } from "@/lib/splits";
export async function POST(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const auth = await requireUser();
    if ("error" in auth)
        return auth.error;
    const limit = await consumeRateLimit({ scope: "split-response", identity: String(auth.user.id), limit: 30, windowSeconds: 900 });
    if (!limit.allowed)
        return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    try {
        return NextResponse.json({ invite: await respondToSplitInvite(auth.user.id, Number((await params).id), "declined", typeof body.code === "string" ? body.code : undefined) });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not decline invite." }, { status: 400 });
    }
}
