import { teamActor } from "@/lib/team/access";
import { teamRead } from "@/lib/team/service";
import { TeamError } from "@/lib/team/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Short, renewable streams work across Node workers without an in-memory bus.
// The database remains authoritative, including on reconnect and access revocation.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const workspace = params.get("workspace") || undefined;
  let initial;
  try {
    initial = await teamRead(await teamActor(workspace), "messages", params);
  } catch (error) {
    return Response.json({ error: "Conversation unavailable." }, { status: error instanceof TeamError ? error.status : 503 });
  }
  const encoder = new TextEncoder();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      let previous = JSON.stringify(initial);
      let ticks = 0;
      const close = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        controller.close();
      };
      request.signal.addEventListener("abort", close, { once: true });
      controller.enqueue(encoder.encode(`retry: 1000\ndata: ${previous}\n\n`));
      const tick = async () => {
        if (stopped) return;
        try {
          const data = JSON.stringify(await teamRead(await teamActor(workspace), "messages", params));
          if (stopped) return;
          controller.enqueue(encoder.encode(data !== previous ? `data: ${data}\n\n` : ": heartbeat\n\n"));
          previous = data;
          if (++ticks >= 20) { close(); return; }
          timer = setTimeout(tick, 1200);
        } catch {
          if (!stopped) controller.enqueue(encoder.encode("event: unavailable\ndata: {}\n\n"));
          close();
        }
      };
      timer = setTimeout(tick, 1200);
    },
    cancel() { stopped = true; clearTimeout(timer); }
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-store, no-transform",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff"
  } });
}
