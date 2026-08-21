import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { getDireNoteTrackRevenue } from "@/lib/direnote-service";

export const runtime = "nodejs";
const schema = z.object({ isrc: z.string().trim().min(1).max(64), import: z.boolean().optional().default(false) });

export async function POST(request: Request) {
  const admin = await requireAdminPermission("royalties.import");
  if ("error" in admin) return admin.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A valid ISRC is required." }, { status: 400 });
  try { return NextResponse.json(await getDireNoteTrackRevenue(parsed.data.isrc, "sub" in admin ? Number(admin.sub) : null, parsed.data.import)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "DireNote revenue lookup failed." }, { status: 502 }); }
}
