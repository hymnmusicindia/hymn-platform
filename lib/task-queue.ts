import { prisma } from "@/lib/prisma";

export type AdminTaskInput = { eventKey: string; type: string; priority: "low" | "normal" | "high" | "critical"; title: string; body: string; href: string; entityType: string; entityId: string | number };
const memoryTasks: Array<AdminTaskInput & { id: number; status: string; createdAt: string; updatedAt: string }> = [];

function usesPostgres() {
  return process.env.DATABASE_URL?.startsWith("postgres") ?? false;
}

export async function createAdminTaskOnce(input: AdminTaskInput) {
  if (!input.eventKey.trim()) throw new Error("Admin task eventKey is required.");
  if (usesPostgres()) {
    const existing = await prisma.adminTask.findUnique({ where: { eventKey: input.eventKey } });
    if (existing) return existing;
    let created = false;
    const task = await prisma.adminTask.create({ data: { ...input, entityId: String(input.entityId) } }).then((value) => { created = true; return value; }).catch(async (error: any) => {
      if (error?.code === "P2002") return prisma.adminTask.findUniqueOrThrow({ where: { eventKey: input.eventKey } });
      throw error;
    });
    if (created) await prisma.adminTaskHistory.create({ data: { taskId: task.id, action: "created", metadata: { eventKey: input.eventKey, priority: input.priority } } });
    return task;
  }
  const existing = memoryTasks.find((task) => task.eventKey === input.eventKey);
  if (existing) return existing;
  const now = new Date().toISOString();
  const task = { ...input, id: memoryTasks.length + 1, entityId: String(input.entityId), status: "open", createdAt: now, updatedAt: now };
  memoryTasks.unshift(task);
  return task;
}

export async function resolveAdminTask(eventKey: string, note?: string) {
  if (usesPostgres()) return prisma.adminTask.updateMany({ where: { eventKey, status: { not: "resolved" } }, data: { status: "resolved", resolutionNote: note ?? null, resolvedAt: new Date() } });
  const task = memoryTasks.find((item) => item.eventKey === eventKey);
  if (task) { task.status = "resolved"; task.updatedAt = new Date().toISOString(); }
  return task ?? null;
}

export async function listAdminTasks(filters: { status?: string; type?: string; priority?: string } = {}) {
  if (!usesPostgres()) return memoryTasks.filter((task) => (!filters.status || task.status === filters.status) && (!filters.type || task.type === filters.type) && (!filters.priority || task.priority === filters.priority));
  return prisma.adminTask.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : { status: { not: "resolved" }, OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }] }),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.priority ? { priority: filters.priority } : {})
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 250
  });
}

export async function updateAdminTask(id: number, input: { status?: string; assignedTo?: number | null; note?: string | null; snoozedUntil?: Date | null; actorId?: number | null }) {
  if (!usesPostgres()) {
    const task = memoryTasks.find((item) => item.id === id);
    if (!task) return null;
    if (input.status) task.status = input.status;
    task.updatedAt = new Date().toISOString();
    return task;
  }
  const task = await prisma.adminTask.update({
    where: { id },
    data: {
      status: input.status,
      assignedTo: input.assignedTo,
      resolutionNote: input.note,
      snoozedUntil: input.snoozedUntil,
      resolvedAt: input.status === "resolved" ? new Date() : undefined
    }
  });
  await prisma.adminTaskHistory.create({ data: { taskId: id, actorId: input.actorId ?? null, action: input.status === "resolved" ? "resolved" : input.status === "snoozed" ? "snoozed" : input.assignedTo !== undefined ? "assigned" : "updated", note: input.note ?? null, metadata: { status: input.status ?? null, assignedTo: input.assignedTo ?? null, snoozedUntil: input.snoozedUntil?.toISOString() ?? null } } });
  return task;
}

export async function listAdminTaskHistory(taskId: number) {
  if (!usesPostgres()) return [];
  return prisma.adminTaskHistory.findMany({ where: { taskId }, orderBy: { createdAt: "desc" } });
}
