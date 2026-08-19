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
  metadata?: Record<string, unknown>;
  actorRole?: string;
  sessionId?: string;
  riskLevel?: "low" | "normal" | "high" | "critical" | string;
  reason?: string | null;
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
        entity: input.entityType,
        entityId: String(input.entityId),
        action: input.action,
        metadata: {
          actorType: input.actorType,
          actorRole: input.actorRole ?? null,
          sessionId: input.sessionId ?? null,
          riskLevel: input.riskLevel ?? "normal",
          reason: input.reason ?? null,
          oldValue: safe.oldValue ?? null,
          newValue: safe.newValue ?? null,
          ...(safe.metadata ?? {})
        }
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
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }
  return memoryAuditEvents.filter((event) => (!filters.entityType || event.entityType === filters.entityType) && (filters.entityId === undefined || String(event.entityId) === String(filters.entityId)) && (!filters.actorId || event.actorId === filters.actorId) && (!filters.action || event.action === filters.action)).slice(0, limit);
}
