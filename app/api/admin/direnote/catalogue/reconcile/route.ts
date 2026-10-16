import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRecentAdminPermission } from "@/lib/access";
import { isSameAppOrigin } from "@/lib/request-origin";
import { prisma } from "@/lib/prisma";
import { reserveDireNoteRequest } from "@/lib/direnote-rate-limit";
import { getDireNoteArtistInformation, getDireNoteSongwriterInformation, getDireNoteReleaseInformation, redactDireNoteDiagnostic } from "@/lib/direnote";
import { confirmsDireNoteIdentityChange, confirmsDireNoteWithdrawal } from "@/lib/direnote/v24-reconciliation";

export async function POST(request: Request) {
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const admin = await requireRecentAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  const input = z.object({ auditId: z.number().int().positive() }).strict().safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Choose an audit record." }, { status: 400 });
  const attempt = await prisma.direNoteLog.findUnique({ where: { id: input.data.auditId } });
  if (!attempt || !["v24_update_artist", "v24_update_songwriter", "v24_withdraw_release"].includes(attempt.action)) return NextResponse.json({ error: "Provider change not found." }, { status: 404 });
  if ((attempt.responseJson as { state?: string } | null)?.state !== "unconfirmed") return NextResponse.json({ error: "This change is not awaiting reconciliation." }, { status: 409 });
  const saved = attempt.requestPayloadRedacted as { payload: Record<string, unknown> };
  const payload = saved.payload; const action = attempt.action.replace(/^v24_/, "");
  const actorId = "sub" in admin ? Number(admin.sub) || null : null;
  try {
    await reserveDireNoteRequest("v24_reconcile", null, actorId);
    const result = action === "update_artist" ? await getDireNoteArtistInformation(Number(payload.artist_id)) : action === "update_songwriter" ? await getDireNoteSongwriterInformation(Number(payload.songwriter_id)) : await getDireNoteReleaseInformation(String(payload.upc));
    const safe = redactDireNoteDiagnostic(result.data ?? null);
    const confirmed = result.success && (action === "withdraw_release" ? confirmsDireNoteWithdrawal(payload, result.data) : confirmsDireNoteIdentityChange(action, payload, result.data));
    if (result.httpStatus === 429) await prisma.direNoteLog.create({ data: { action: "provider_rate_limit", success: false, httpStatus: 429, responseJson: { retryAt: new Date(Date.now() + Math.max(1, result.retryAfterSeconds ?? 60) * 1000).toISOString() } } });
    await prisma.direNoteLog.create({ data: { action: "v24_reconcile", success: confirmed, createdByAdminId: actorId, httpStatus: result.httpStatus, requestPayloadRedacted: { auditId: attempt.id }, responseJson: safe as never, errorMessage: confirmed ? null : "Current provider data does not prove that the requested change completed. No write was resent." } });
    if (confirmed) await prisma.direNoteLog.updateMany({ where: { id: attempt.id, responseJson: { path: ["state"], equals: "unconfirmed" } }, data: { success: true, errorMessage: null, responseJson: { state: "confirmed", reconciledAt: new Date().toISOString(), provider: safe } as never } });
    return NextResponse.json({ confirmed, data: safe, message: confirmed ? "Provider data confirms the recorded change. No write was resent." : "The outcome remains unconfirmed. Contact DireNote with the audit ID; do not resend the change." }, { status: result.success ? 200 : 502, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: String(redactDireNoteDiagnostic(error instanceof Error ? error.message : "Reconciliation failed.")) }, { status: 502 }); }
}
