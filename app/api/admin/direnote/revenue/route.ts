import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { getDireNoteTrackRevenue } from "@/lib/direnote-service";
import { isSameAppOrigin } from "@/lib/request-origin";
import { validIsrc } from "@/lib/release-input-rules";

export const runtime = "nodejs";
const schema = z.object({ isrc: z.string().trim().max(64).transform(value => value.replace(/[\s-]+/g, "").toUpperCase()).refine(validIsrc), import: z.boolean().optional().default(false) }).strict();
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403, headers });
  const admin = await requireAdminPermission("royalties.import");
  if ("error" in admin) return admin.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid ISRC is required." }, { status: 400, headers });
  try { return NextResponse.json(await getDireNoteTrackRevenue(parsed.data.isrc, "sub" in admin ? Number(admin.sub) : null, parsed.data.import), { headers }); }
  catch (error) {
    const limited = (error as { code?: string })?.code === "DIRENOTE_RATE_LIMIT";
    return NextResponse.json({ error: error instanceof Error ? error.message : "DireNote revenue lookup failed." }, { status: limited ? 429 : 502, headers });
  }
}
