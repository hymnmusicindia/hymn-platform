import { consumeRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { previewSplitCode } from "@/lib/splits";
export const runtime = "nodejs";
export async function POST(request: Request) {
    const auth = await requireUser();
    if ("error" in auth)
        return auth.error;
    const limit = await consumeRateLimit({ scope: "split-code", identity: String(auth.user.id), limit: 10, windowSeconds: 900 });
    if (!limit.allowed)
        return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    try {
        return NextResponse.json({ preview: await previewSplitCode(auth.user.id, String(body.code || "")) });
    }
    catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Could not validate code." }, { status: 400 });
    }
}
