import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  const body = await request.json().catch(() => null) as { url?: string } | null;
  const url = body?.url?.trim();
  if (!url) return NextResponse.json({ error: "Uploaded asset URL is required." }, { status: 400 });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const asset = await prisma.storedAsset.findFirst({
      where: { objectKey: url, ownerUserId: result.user.id, deletedAt: null },
      select: { id: true },
    });
    if (asset) return NextResponse.json({ downloadPath: `/api/assets/${asset.id}/download` }, { headers: { "Cache-Control": "no-store" } });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return NextResponse.json({ error: "The private upload is still being finalized. Please try again." }, { status: 409 });
}
