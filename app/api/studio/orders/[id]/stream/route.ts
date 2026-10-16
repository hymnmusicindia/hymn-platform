import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { assertStudioParticipant } from "@/lib/studio-services";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const snapshot = async () => {
    const auth = await requireUser();
    if ("error" in auth || auth.user.status !== "active") throw new Error("Access unavailable");
    const order = await assertStudioParticipant(id, auth.user.id);
    const [messages, file] = await Promise.all([
      prisma.studioMessage.findMany({ where: { orderId: order.id }, orderBy: { id: "desc" }, take: 100, include: { sender: { select: { name: true } } } }),
      prisma.studioFile.findFirst({ where: { orderId: order.id }, orderBy: { id: "desc" }, select: { id: true } })
    ]);
    return { messages: messages.reverse().map(m => ({ id: m.id, senderUserId: m.senderUserId, senderName: m.sender?.name ?? null, body: m.body, kind: m.kind, metadata: m.metadata, idempotencyKey: m.idempotencyKey, createdAt: m.createdAt.toISOString() })), state: `${order.updatedAt.toISOString()}:${file?.id || 0}` };
  };
  let initial;
  try { initial = await snapshot(); }
  catch { return Response.json({ error: "Studio conversation unavailable." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
  const encoder = new TextEncoder();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      let last = JSON.stringify(initial), ticks = 0;
      const close = () => { if (stopped) return; stopped = true; clearTimeout(timer); controller.close(); };
      request.signal.addEventListener("abort", close, { once: true });
      controller.enqueue(encoder.encode(`retry: 750\ndata: ${last}\n\n`));
      const tick = async () => {
        if (stopped) return;
        try {
          const next = JSON.stringify(await snapshot());
          if (stopped) return;
          controller.enqueue(encoder.encode(next === last ? ": heartbeat\n\n" : `data: ${next}\n\n`));
          last = next;
          if (++ticks >= 30) { close(); return; }
          timer = setTimeout(tick, 750);
        } catch {
          if (!stopped) controller.enqueue(encoder.encode("event: unavailable\ndata: {}\n\n"));
          close();
        }
      };
      timer = setTimeout(tick, 750);
    },
    cancel() { stopped = true; clearTimeout(timer); }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff" } });
}
