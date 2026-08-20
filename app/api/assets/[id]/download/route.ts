import { NextResponse } from "next/server";
import { getAdminSession, getSession } from "@/lib/session";
import { localPrivateStorage } from "@/lib/private-storage";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  const admin = user ? null : await getAdminSession();
  if (!user && !admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  try {
    const asset = await localPrivateStorage.createAuthorizedRead({ assetId: Number((await context.params).id), requesterUserId: user?.sub ?? 0, isAdmin: Boolean(admin) });
    return new NextResponse(new Uint8Array(asset.bytes), { headers: { "Content-Type": asset.mimeType, "Content-Disposition": `attachment; filename="${asset.fileName.replace(/["\\]/g, "_")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Asset is unavailable.";
    return NextResponse.json({ error: message }, { status: message === "Forbidden." ? 403 : 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
}
// vercel trigger 9
