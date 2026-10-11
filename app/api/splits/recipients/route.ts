import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { findSplitArtist } from "@/lib/user-handles";
import { consumeRateLimit } from "@/lib/rate-limit";
export async function GET(request: Request) {
    const auth = await requireUser();
    if ("error" in auth)
        return auth.error;
    const limit = await consumeRateLimit({ scope: "split-directory", identity: String(auth.user.id), limit: 30, windowSeconds: 60 });
    if (!limit.allowed)
        return NextResponse.json({ error: "Too many searches. Try again shortly." }, { status: 429 });
    try {
        const artist = await findSplitArtist(new URL(request.url).searchParams.get("q") || "");
        return NextResponse.json({ artist: artist ? { id: artist.id, name: artist.name, tag: artist.tag, avatar: artist.avatar } : null }, { headers: { "Cache-Control": "private, no-store" } });
    }
    catch {
        return NextResponse.json({ error: "Enter a complete email address or @name#1234 handle." }, { status: 400 });
    }
}
