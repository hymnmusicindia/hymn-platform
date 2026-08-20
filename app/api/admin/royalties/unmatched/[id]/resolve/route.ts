import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { resolveUnmatchedRoyaltyRow } from "@/lib/royalty-import";

const schema = z.object({ releaseId: z.number().int().positive(), trackId: z.number().int().positive().nullable().optional(), note: z.string().trim().min(5).max(2000) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPermission("royalties.reconcile"); if ("error" in admin) return admin.error;
  try { const body = schema.parse(await request.json()); return NextResponse.json(await resolveUnmatchedRoyaltyRow({ unmatchedRowId: Number((await context.params).id), actorId: "sub" in admin ? Number(admin.sub) : 0, ...body })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Royalty match failed." }, { status: 400 }); }
}
// vercel trigger 9
