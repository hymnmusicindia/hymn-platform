import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { isSameAppOrigin } from "@/lib/request-origin";
import { logAuditEvent } from "@/lib/audit-log";
import { CLIENT_INTERESTS } from "@/lib/team/client-interests";
import { importWorkspaceClientAccounts } from "@/lib/team/client-cards";

const email = z.union([z.string().trim().email().max(320), z.literal("")]).transform(value => value.toLowerCase());
const updateSchema = z.object({
  id: z.string().min(1).max(80), version: z.number().int().positive(),
  name: z.string().trim().min(1).max(160), phone: z.string().trim().max(40).regex(/^[+\d\s().-]*$/),
  email, secondaryEmail: email, city: z.string().trim().max(100), state: z.string().trim().max(100),
  interests: z.array(z.enum(Object.keys(CLIENT_INTERESTS) as [keyof typeof CLIENT_INTERESTS, ...(keyof typeof CLIENT_INTERESTS)[]])).max(6),
  notes: z.string().trim().max(10000), ownerId: z.string().min(1).max(80), status: z.enum(["ACTIVE", "DO_NOT_CONTACT", "ARCHIVED"])
});

export async function GET(request: Request) {
  const admin = await requireAdminPermission("users.manage");
  if ("error" in admin) return admin.error;
  const workspace = await prisma.teamWorkspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!workspace) return NextResponse.json({ items: [], members: [], total: 0 });
  await importWorkspaceClientAccounts(workspace.id);
  const params = new URL(request.url).searchParams;
  const offset = Math.max(0, Math.min(100000, Number.parseInt(params.get("offset") || "0", 10) || 0));
  const query = (params.get("q") || "").trim().slice(0, 160);
  const where = { workspaceId: workspace.id, ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }, { secondaryEmail: { contains: query, mode: "insensitive" as const } }, { phone: { contains: query } }, { city: { contains: query, mode: "insensitive" as const } }, { state: { contains: query, mode: "insensitive" as const } }, { user: { is: { email: { contains: query, mode: "insensitive" as const } } } }] } : {}) };
  const [items, total, members] = await Promise.all([
    prisma.teamClient.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100, skip: offset, include: { user: { select: { id: true, status: true, role: true, name: true, email: true, mobile: true } }, owner: { select: { id: true, user: { select: { name: true, email: true } } } } } }),
    prisma.teamClient.count({ where }),
    prisma.teamMember.findMany({ where: { workspaceId: workspace.id, status: "ACTIVE", user: { status: "ACTIVE" } }, orderBy: { joinedAt: "asc" }, select: { id: true, user: { select: { name: true, email: true } } } })
  ]);
  return NextResponse.json({ items, members, total, offset });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminPermission("users.manage");
  if ("error" in admin) return admin.error;
  if (!isSameAppOrigin(request)) return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid client card." }, { status: 400 });
  const input = parsed.data;
  if (input.secondaryEmail && input.secondaryEmail === input.email) return NextResponse.json({ error: "Primary and secondary email addresses must differ." }, { status: 400 });
  const result = await prisma.$transaction(async tx => {
    const snapshot = await tx.teamClient.findUnique({ where: { id: input.id }, select: { id: true, workspaceId: true } });
    if (!snapshot) return { error: "Client card not found.", status: 404 as const };
    await tx.$queryRaw`SELECT id FROM team_workspaces WHERE id = ${snapshot.workspaceId} FOR UPDATE`;
    const current = await tx.teamClient.findUnique({ where: { id: input.id } });
    if (!current) return { error: "Client card not found.", status: 404 as const };
    if (current.version !== input.version) return { error: "This card changed. Refresh and try again.", status: 409 as const };
    const [owner, duplicate] = await Promise.all([
      tx.teamMember.findFirst({ where: { id: input.ownerId, workspaceId: current.workspaceId, status: "ACTIVE", user: { status: "ACTIVE" } }, select: { id: true } }),
      tx.teamClient.findFirst({ where: { workspaceId: current.workspaceId, id: { not: current.id }, OR: [
        ...(input.email ? [{ email: { equals: input.email, mode: "insensitive" as const } }, { secondaryEmail: { equals: input.email, mode: "insensitive" as const } }] : []),
        ...(input.secondaryEmail ? [{ email: { equals: input.secondaryEmail, mode: "insensitive" as const } }, { secondaryEmail: { equals: input.secondaryEmail, mode: "insensitive" as const } }] : []),
        ...(input.phone ? [{ phone: input.phone.replace(/[^+\d]/g, "") }] : [])
      ] } })
    ]);
    if (!owner) return { error: "Choose an active team member in this workspace.", status: 400 as const };
    if (duplicate) return { error: "Another card already uses this email or WhatsApp number.", status: 409 as const };
    const row = await tx.teamClient.update({ where: { id: current.id }, data: {
      name: input.name, phone: input.phone.replace(/[^+\d]/g, ""), email: input.email, secondaryEmail: input.secondaryEmail,
      city: input.city, state: input.state, interests: [...new Set(input.interests)], notes: input.notes,
      ownerId: input.ownerId, status: input.status, version: { increment: 1 }
    }, include: { user: { select: { id: true, status: true, role: true, name: true, email: true, mobile: true } }, owner: { select: { id: true, user: { select: { name: true, email: true } } } } } });
    return { item: row, previous: { ownerId: current.ownerId, status: current.status } };
  }, { maxWait: 10000, timeout: 30000 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  await logAuditEvent({ actorType: "admin", actorId: Number(admin.sub) || null, actorRole: "admin", entityType: "team_client", entityId: result.item.id, action: "client_card.updated", oldValue: result.previous, newValue: { ownerId: result.item.ownerId, status: result.item.status, name: result.item.name, email: result.item.email, phone: result.item.phone } }).catch(error => console.error("Client card audit write failed", { clientId: result.item.id, error }));
  return NextResponse.json({ item: result.item });
}
