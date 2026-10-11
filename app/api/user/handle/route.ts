import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { ensureUserHandle, setUserHandle } from "@/lib/user-handles";
import { consumeRateLimit } from "@/lib/rate-limit";
export async function GET() {
    const auth = await requireUser();
    if ("error" in auth)
        return auth.error;
    return NextResponse.json({ tag: await ensureUserHandle(auth.user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PATCH(request: Request) {
    const auth = await requireUser();
    if ("error" in auth)
        return auth.error;
    const limit = await consumeRateLimit({ scope: "handle-edit", identity: String(auth.user.id), limit: 10, windowSeconds: 3600 });
    if (!limit.allowed)
        return NextResponse.json({ error: "Too many changes. Try again later." }, { status: 429 });
    const body = await request.json().catch(() => ({}));
    try {
        return NextResponse.json({ tag: await setUserHandle(auth.user.id, String(body.tag || "")) });
    }
    catch (error) {
        return NextResponse.json({ error: (error as {
                code?: string;
            }).code === "P2002" ? "This handle is reserved. Choose another name or number." : error instanceof Error ? error.message : "Could not save handle." }, { status: (error as {
                code?: string;
            }).code === "P2002" ? 409 : 400 });
    }
}
