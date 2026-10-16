import { after, NextResponse } from "next/server";
import { requireAdminPermission, requireRecentAdminPermission } from "@/lib/access";
import { isSameAppOrigin } from "@/lib/request-origin";
import { prisma } from "@/lib/prisma";
import { reserveDireNoteRequest } from "@/lib/direnote-rate-limit";
import { redactDireNoteDiagnostic } from "@/lib/direnote";
import { requestDireNoteV24 } from "@/lib/direnote/v24-client";
import { direNoteV24Request, direNoteV24Schemas, isDireNoteMutation, isDireNoteReference } from "@/lib/direnote/v24-contract";
import { syncDireNoteRelease } from "@/lib/direnote-service";

export const maxDuration = 90;
const headers = { "Cache-Control": "private, no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET() {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  const pending = await prisma.direNoteLog.findMany({ where: { action: { in: ["v24_update_artist", "v24_update_songwriter", "v24_withdraw_release"] }, responseJson: { path: ["state"], equals: "unconfirmed" } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, createdAt: true, requestPayloadRedacted: true } });
  return reply({ pending: redactDireNoteDiagnostic(pending) });
}

export async function POST(request: Request) {
  if (!isSameAppOrigin(request)) return reply({ error: "Same-origin request required." }, 403);
  const input = direNoteV24Request.safeParse(await request.json().catch(() => null));
  if (!input.success) return reply({ error: "Choose a supported provider operation." }, 400);
  const { action, operationId, confirmation } = input.data;
  const mutation = isDireNoteMutation(action);
  const admin = mutation ? await requireRecentAdminPermission("system.manage") : await requireAdminPermission(action === "list_payouts" ? "payouts.review" : "releases.read");
  if ("error" in admin) return admin.error;
  const parsed = direNoteV24Schemas[action].safeParse(input.data.payload);
  if (!parsed.success) return reply({ error: parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ") }, 400);
  const payload = parsed.data;
  const actorId = "sub" in admin ? Number(admin.sub) || null : null;
  const logAction = `v24_${action}`;
  const cacheKey = JSON.stringify(payload);
  const resource = "upc" in payload ? `upc:${payload.upc}` : "artist_id" in payload ? `artist:${payload.artist_id}` : "songwriter_id" in payload ? `songwriter:${payload.songwriter_id}` : "";
  if (mutation && (!operationId || confirmation !== (action === "withdraw_release" ? `WITHDRAW ${"upc" in payload ? payload.upc : ""}` : "CONFIRM UPDATE"))) return reply({ error: "Explicit confirmation and a unique operation ID are required. Withdrawal cannot be undone." }, 400);
  let attemptId: number | undefined;
  let dispatched = false;
  try {
    if (isDireNoteReference(action)) {
      const cached = await prisma.direNoteLog.findFirst({ where: { action: logAction, success: true, createdAt: { gte: new Date(Date.now() - 86400000) }, requestPayloadRedacted: { path: ["cacheKey"], equals: cacheKey } }, orderBy: { createdAt: "desc" }, select: { responseJson: true, createdAt: true } });
      if (cached) return reply({ data: cached.responseJson, cachedAt: cached.createdAt });
    }
    if (mutation) {
      const claim = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422027)`;
        if (action === "withdraw_release" && "upc" in payload) {
          const releases = await tx.release.findMany({ where: { upc: payload.upc }, select: { id: true }, orderBy: { id: "asc" } });
          for (const release of releases) {
            const locks = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(81422028, ${release.id}::integer) AS locked`;
            if (!locks[0]?.locked) throw new Error("Delivery is currently running for this UPC. Wait for it to finish before withdrawing.");
          }
        }
        const existing = await tx.direNoteLog.findFirst({ where: { action: logAction, requestPayloadRedacted: { path: ["operationId"], equals: operationId! } }, orderBy: { id: "desc" } });
        if (existing) {
          const prior = existing.requestPayloadRedacted as { cacheKey?: string } | null;
          if (prior?.cacheKey !== cacheKey) throw new Error("This operation ID belongs to a different change.");
          return { existing };
        }
        const pending = await tx.direNoteLog.findFirst({ where: { action: logAction, AND: [{ requestPayloadRedacted: { path: ["resource"], equals: resource } }, { responseJson: { path: ["state"], equals: "unconfirmed" } }] } });
        if (pending) throw Object.assign(new Error(`A previous change for this record has an unconfirmed outcome (audit ${pending.id}). Reconcile with DireNote before another change.`), { auditId: pending.id, unconfirmed: true });
        const created = await tx.direNoteLog.create({ data: { action: logAction, success: false, createdByAdminId: actorId, requestPayloadRedacted: { operationId, resource, cacheKey, payload } as never, responseJson: { state: "unconfirmed" }, errorMessage: "Provider operation started; outcome not yet confirmed." } });
        return { id: created.id };
      });
      if (claim.existing) return reply({ data: claim.existing.responseJson, auditId: claim.existing.id, replayed: true, error: claim.existing.success ? undefined : claim.existing.errorMessage }, claim.existing.success ? 200 : 409);
      attemptId = claim.id;
    }
    await reserveDireNoteRequest(action, null, actorId);
    dispatched = true;
    const result = await requestDireNoteV24(action, payload);
    const safe = redactDireNoteDiagnostic(result.data ?? null);
    const error = String(redactDireNoteDiagnostic(result.error || `DireNote returned HTTP ${result.httpStatus ?? "unknown"}.`));
    const retry = Math.max(1, result.retryAfterSeconds ?? 60);
    if (result.httpStatus === 429) await prisma.direNoteLog.create({ data: { action: "provider_rate_limit", success: false, httpStatus: 429, responseJson: { retryAt: new Date(Date.now() + retry * 1000).toISOString() } } });
    // A timeout/5xx may have occurred after a provider write. Never automatically replay it.
    const unconfirmed = mutation && !result.success && ![400, 401, 403, 404, 409, 422, 429].includes(result.httpStatus ?? 0);
    const data = mutation ? { state: unconfirmed ? "unconfirmed" : result.success ? "confirmed" : "rejected", provider: safe } : safe;
    const record = { success: result.success, httpStatus: result.httpStatus, responseJson: data as never, errorMessage: result.success ? null : error };
    const log = attemptId ? await prisma.direNoteLog.update({ where: { id: attemptId }, data: record }) : await prisma.direNoteLog.create({ data: { ...record, action: logAction, createdByAdminId: actorId, requestPayloadRedacted: { cacheKey } } });
    if (result.success && action === "withdraw_release" && "upc" in payload) {
      const releases = await prisma.release.findMany({ where: { upc: payload.upc }, select: { id: true }, take: 5 });
      after(async () => {
        for (const release of releases) {
          try { await syncDireNoteRelease(release.id, actorId); }
          catch (error) { console.warn("Withdrawn release awaits scheduled status reconciliation", { releaseId: release.id, error: String(redactDireNoteDiagnostic(error instanceof Error ? error.message : "Status refresh failed")) }); }
        }
      });
    }
    return reply({ data, auditId: log.id, error: result.success ? undefined : error, unconfirmed, retryAfterSeconds: result.httpStatus === 429 ? retry : undefined }, result.success ? 200 : result.httpStatus === 429 ? 429 : result.httpStatus === 409 ? 409 : 502);
  } catch (error) {
    const message = String(redactDireNoteDiagnostic(error instanceof Error ? error.message : "Provider operation failed."));
    if (attemptId && !dispatched) await prisma.direNoteLog.update({ where: { id: attemptId }, data: { responseJson: { state: "not_sent" }, errorMessage: message } });
    // Even a process crash leaves the pre-write audit row blocking accidental duplicates.
    const limited = error && typeof error === "object" && "code" in error && error.code === "DIRENOTE_RATE_LIMIT";
    const previousAuditId = error && typeof error === "object" && "auditId" in error ? Number(error.auditId) : undefined;
    return reply({ error: message, auditId: attemptId ?? previousAuditId, unconfirmed: Boolean((attemptId && dispatched) || previousAuditId) }, limited ? 429 : 409);
  }
}
