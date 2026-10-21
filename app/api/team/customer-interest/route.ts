import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { isSameAppOrigin } from '@/lib/request-origin';
import { consumeRateLimit } from '@/lib/rate-limit';
import { serviceForPath } from '@/lib/team/service-interest';
export async function POST(request: Request) {
  if (!isSameAppOrigin(request)) return Response.json({ error: 'Invalid origin.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 1024) return new Response(null, { status: 413 });
  try {
    const session = await getSession();
    if (!session || process.env.TEAM_AUTOMATION_ENABLED === 'false') return new Response(null, { status: 204 });
    const user = await prisma.user.findFirst({ where: { id: session.sub, status: 'ACTIVE', role: { in: ['CUSTOMER', 'PRODUCER'] } }, select: { id: true } });
    if (!user) return new Response(null, { status: 204 });
    const limit = await consumeRateLimit({ scope: 'customer-service-interest', identity: String(user.id), limit: 20, windowSeconds: 86400 });
    if (!limit.allowed) return new Response(null, { status: 429 });
    const raw = await request.text(); if (raw.length > 1024) return new Response(null, { status: 413 });
    let path: string;
    try { const data = JSON.parse(raw); path = typeof data.path === 'string' ? data.path : ''; } catch { return new Response(null, { status: 400 }); }
    const service = serviceForPath(path);
    if (!service) return new Response(null, { status: 400 });
    const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    await prisma.growthEvent.createMany({ data: [{ key: `support-interest:${user.id}:${service}:${day}`, event: 'customer_service_interest', source: 'support_signal', userId: user.id, properties: { service, path } }], skipDuplicates: true });
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 503 }); }
}
