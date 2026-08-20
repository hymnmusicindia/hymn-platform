import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditActorType = "user" | "admin" | "system" | "webhook" | "cron";
export type AuditEventInput = {
  actorType: AuditActorType;
  actorId?: number | null;
  entityType: string;
  entityId: string | number;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  actorRole?: string;
  reason?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  riskLevel?: "low" | "normal" | "high" | "critical";
  metadata?: Record<string, unknown>;
};

const memoryAuditEvents: Array<AuditEventInput & { id: number; createdAt: string }> = [];

function usesPostgres() {
  return process.env.DATABASE_URL?.startsWith("postgres") ?? false;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, /pin|secret|password|token|client_id|signature/i.test(key) ? "[REDACTED]" : redact(item)]));
}

export async function logAuditEvent(input: AuditEventInput) {
  const safe = { ...input, oldValue: redact(input.oldValue), newValue: redact(input.newValue), metadata: redact(input.metadata) as Record<string, unknown> | undefined };
  if (usesPostgres()) {
    return prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorType: input.actorType,
        actorRole: input.actorRole ?? "unknown",
        entity: input.entityType,
        entityId: String(input.entityId),
        action: input.action,
        previousValue: safe.oldValue === undefined ? undefined : safe.oldValue as Prisma.InputJsonValue,
        newValue: safe.newValue === undefined ? undefined : safe.newValue as Prisma.InputJsonValue,
        reason: input.reason?.trim() || null,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        sessionId: input.sessionId ?? null,
        riskLevel: input.riskLevel ?? "normal",
        metadata: safe.metadata as Prisma.InputJsonValue | undefined
      }
    });
  }
  const event = { ...safe, id: memoryAuditEvents.length + 1, createdAt: new Date().toISOString() };
  memoryAuditEvents.unshift(event);
  return event;
}

export async function listAuditEvents(filters: { entityType?: string; entityId?: string | number; actorId?: number; action?: string; riskLevel?: string; requestId?: string; cursor?: number; limit?: number } = {}) {
  const limit = Math.max(1, Math.min(filters.limit ?? 100, 250));
  if (usesPostgres()) {
    return prisma.auditLog.findMany({
      where: {
        ...(filters.entityType ? { entity: filters.entityType } : {}),
        ...(filters.entityId !== undefined ? { entityId: String(filters.entityId) } : {}),
        ...(filters.actorId ? { actorId: filters.actorId } : {})
        ,...(filters.action ? { action: filters.action } : {})
        ,...(filters.riskLevel ? { riskLevel: filters.riskLevel } : {})
        ,...(filters.requestId ? { requestId: filters.requestId } : {})
        ,...(filters.cursor ? { id: { lt: filters.cursor } } : {})
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }
  return memoryAuditEvents.filter((event) => (!filters.entityType || event.entityType === filters.entityType) && (filters.entityId === undefined || String(event.entityId) === String(filters.entityId)) && (!filters.actorId || event.actorId === filters.actorId) && (!filters.action || event.action === filters.action) && (!filters.riskLevel || event.riskLevel === filters.riskLevel) && (!filters.requestId || event.requestId === filters.requestId) && (!filters.cursor || event.id < filters.cursor)).slice(0, limit).map(event => ({ ...event, entity: event.entityType, previousValue: event.oldValue, newValue: event.newValue, actorRole: event.actorRole ?? "unknown", reason: event.reason ?? null, requestId: event.requestId ?? null, riskLevel: event.riskLevel ?? "normal" }));
}
// vercel trigger 9
