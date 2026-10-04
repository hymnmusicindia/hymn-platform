import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission, requireRecentAdminPermission } from "@/lib/access";
import { newsletterToken, normalizeNewsletterEmail } from "@/lib/newsletter";
import { prisma } from "@/lib/prisma";

const addSchema = z.object({ emails: z.array(z.string().trim().email().max(320)).min(1).max(500), source: z.string().trim().min(2).max(50).default("admin") });
const updateSchema = z.object({ id: z.number().int().positive(), action: z.enum(["remove", "restore"]) });
const actorId = (admin: Awaited<ReturnType<typeof requireRecentAdminPermission>>) => "sub" in admin ? Number(admin.sub) || null : null;

export async function GET(request: Request) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const query = new URL(request.url).searchParams;
  const status = query.get("status") || "all";
  const source = query.get("source") || "all";
  const search = query.get("search")?.trim().slice(0, 120) || "";
  const where = {
    ...(status !== "all" ? { status } : {}),
    ...(source !== "all" ? { source } : {}),
    ...(search ? { email: { contains: search, mode: "insensitive" as const } } : {})
  };
  const [subscribers, counts, sourceGroups] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ where, orderBy: status === "unsubscribed" ? [{ unsubscribedAt: "desc" }, { id: "desc" }] : { createdAt: "desc" }, take: 500 }),
    Promise.all(["subscribed", "unsubscribed", "removed"].map(async key => [key, await prisma.newsletterSubscriber.count({ where: { status: key } })] as const)),
    prisma.newsletterSubscriber.groupBy({ by: ["source"], where: { status: "subscribed" }, _count: { _all: true }, orderBy: { source: "asc" } })
  ]);
  return NextResponse.json({ subscribers, counts: Object.fromEntries(counts), sources: sourceGroups.map(item => ({ source: item.source, count: item._count._all })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter one or more valid email addresses." }, { status: 400 });
  const emails = [...new Set(parsed.data.emails.map(normalizeNewsletterEmail))];
  const existing = await prisma.newsletterSubscriber.findMany({ where: { email: { in: emails } }, select: { email: true, status: true } });
  const existingMap = new Map(existing.map(item => [item.email, item.status]));
  const suppressed = emails.filter(email => existingMap.get(email) === "unsubscribed");
  const allowed = emails.filter(email => existingMap.get(email) !== "unsubscribed");
  const source = parsed.data.source.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 50);
  await prisma.$transaction(allowed.map(email => prisma.newsletterSubscriber.upsert({
    where: { email },
    create: { email, source, unsubscribeToken: newsletterToken() },
    update: { status: "subscribed", source, consentAt: new Date(), unsubscribedAt: null }
  })));
  await prisma.auditLog.create({ data: { actorType: "admin", actorId: actorId(admin), action: "NEWSLETTER_SUBSCRIBERS_ADDED", entity: "newsletter_subscriber", entityId: "bulk", metadata: { source, requested: emails.length, added: allowed.length, suppressed: suppressed.length } } });
  return NextResponse.json({ added: allowed.length, suppressed });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminPermission("system.manage");
  if ("error" in admin) return admin.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscriber action." }, { status: 400 });
  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { id: parsed.data.id } });
  if (!subscriber) return NextResponse.json({ error: "Subscriber not found." }, { status: 404 });
  if (parsed.data.action === "restore" && subscriber.status === "unsubscribed") return NextResponse.json({ error: "This address opted out and can only return through a new website subscription." }, { status: 409 });
  const updated = await prisma.newsletterSubscriber.update({ where: { id: subscriber.id }, data: parsed.data.action === "remove" ? { status: "removed" } : { status: "subscribed", consentAt: new Date(), unsubscribedAt: null } });
  await prisma.auditLog.create({ data: { actorType: "admin", actorId: actorId(admin), action: parsed.data.action === "remove" ? "NEWSLETTER_SUBSCRIBER_REMOVED" : "NEWSLETTER_SUBSCRIBER_RESTORED", entity: "newsletter_subscriber", entityId: String(subscriber.id), metadata: { email: subscriber.email, source: subscriber.source } } });
  return NextResponse.json({ subscriber: updated });
}
