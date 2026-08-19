import { NextResponse } from "next/server";
import { requireRecentAdminPermission } from "@/lib/access";
import { createAdminEarningsEntry } from "@/lib/payout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const admin = await requireRecentAdminPermission("royalties.import");
  if (typeof admin === "object" && "error" in admin) return admin.error;

  const body = await request.json().catch(() => ({}));
  if (typeof body.sourceReference !== "string" || body.sourceReference.trim().length < 5 || typeof body.adminNote !== "string" || body.adminNote.trim().length < 10) return NextResponse.json({ error: "Source reference and a detailed administrative note are required." }, { status: 400 });

  try {
    const entry = await createAdminEarningsEntry({
      actorId: "sub" in admin ? admin.sub : null,
      userId: Number(body.userId),
      releaseId: Number(body.releaseId),
      statementMonth: Number(body.statementMonth),
      statementYear: Number(body.statementYear),
      platform: String(body.platform ?? ""),
      territory: typeof body.territory === "string" ? body.territory : undefined,
      grossEarning: Number(body.grossEarning),
      distributorDeduction: Number(body.distributorDeduction ?? 0),
      hymnCommission: Number(body.hymnCommission ?? 0),
      artistNetPayable: Number(body.artistNetPayable),
      streamsDownloads: body.streamsDownloads === "" || body.streamsDownloads === null || body.streamsDownloads === undefined ? null : Number(body.streamsDownloads),
      sourceReference: typeof body.sourceReference === "string" ? body.sourceReference : null,
      adminNote: typeof body.adminNote === "string" ? body.adminNote : null
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save earnings entry." }, { status: 400 });
  }
}

// vercel trigger 2
// vercel trigger 9
