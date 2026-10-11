import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizeHandle } from "@/lib/handle-format";
export async function ensureUserHandle(userId: number) {
    const existing = await prisma.userHandle.findUnique({ where: { userId } });
    if (existing)
        return existing.tag;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    const base = (user.name.toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20) || "artist").padEnd(3, "_");
    for (let attempt = 0; attempt < 15; attempt++) {
        try {
            return await setUserHandle(userId, `@${base}#${String(randomInt(10000)).padStart(4, "0")}`, true);
        }
        catch (error) {
            if ((error as {
                code?: string;
            }).code !== "P2002")
                throw error;
        }
    }
    throw new Error("Could not assign a handle. Please try again.");
}
export async function setUserHandle(userId: number, value: string, onlyIfMissing = false) {
    const tag = normalizeHandle(value);
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const current = await tx.userHandle.findUnique({ where: { userId } });
        if (onlyIfMissing && current)
            return current.tag;
        const reserved = await tx.userHandleReservation.findUnique({ where: { tag } });
        if (reserved && reserved.userId !== userId)
            throw Object.assign(new Error("This handle is already reserved. Choose another name or number."), { code: "P2002" });
        if (!reserved)
            await tx.userHandleReservation.create({ data: { tag, userId } });
        await tx.userHandle.upsert({ where: { userId }, create: { userId, tag }, update: { tag } });
        await tx.auditLog.create({ data: { actorId: userId, action: "HANDLE_CHANGED", entity: "user", entityId: String(userId), metadata: { previous: current?.tag ?? null, tag } } });
        return tag;
    }, { timeout: 30000 });
}
export async function findSplitArtist(query: string) {
    const value = query.trim().toLowerCase();
    if (!value || value.length > 254)
        return null;
    const user = await prisma.user.findFirst({ where: { status: "ACTIVE", ...(value.startsWith("@") ? { handle: { tag: normalizeHandle(value) } } : { email: { equals: value, mode: "insensitive" } }) }, select: { id: true, name: true, email: true, avatar: true } });
    return user ? { ...user, tag: await ensureUserHandle(user.id) } : null;
}
