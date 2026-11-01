import { teamActor } from '@/lib/team/access';
import { teamRead } from '@/lib/team/service';
import { chatRead } from '@/lib/team/chat';
import { onChatChange } from '@/lib/team/chat-events';
import { TeamError } from '@/lib/team/policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const workspace = params.get('workspace') || undefined;
  const native = params.get('view') === 'native';
  const list = native && params.get('list') === '1';
  const read = async () => {
    const actor = await teamActor(workspace);
    const data = native ? await chatRead(actor, list ? 'chat-conversations' : 'chat-messages', params) : await teamRead(actor, 'messages', params);
    return { data, workspaceId: actor.workspaceId };
  };
  let initial;
  try { initial = await read(); }
  catch (error) { return Response.json({ error: 'Conversation unavailable.' }, { status: error instanceof TeamError ? error.status : 503 }); }
  const encoder = new TextEncoder();
  let stopped = false, reading = false, queued = false;
  let timer: ReturnType<typeof setTimeout> | undefined, deadline: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};
  let close = () => {};
  const cleanup = () => { stopped = true; clearTimeout(timer); clearTimeout(deadline); unsubscribe(); request.signal.removeEventListener('abort', close); };
  const stream = new ReadableStream({
    start(controller) {
      let previous = JSON.stringify(initial.data);
      close = () => { if (!stopped) { cleanup(); controller.close(); } };
      request.signal.addEventListener('abort', close, { once: true });
      if (request.signal.aborted) { close(); return; }
      controller.enqueue(encoder.encode(`retry: 1000\ndata: ${previous}\n\n`));
      const tick = async () => {
        if (stopped) return;
        if (reading) { queued = true; return; }
        reading = true; clearTimeout(timer);
        try {
          const data = JSON.stringify((await read()).data);
          if (stopped) return;
          controller.enqueue(encoder.encode(data !== previous ? `data: ${data}\n\n` : ': heartbeat\n\n'));
          previous = data;
          timer = setTimeout(tick, queued ? 100 : 2500);
          queued = false;
        } catch (error) {
          if (!stopped) controller.enqueue(encoder.encode(`event: unavailable\ndata: ${JSON.stringify({ status: error instanceof TeamError ? error.status : 503 })}\n\n`));
          close();
        } finally { reading = false; }
      };
      unsubscribe = onChatChange(initial.workspaceId, channel => {
        if (!list && channel !== params.get('channel')) return;
        if (reading) queued = true;
        else { clearTimeout(timer); timer = setTimeout(tick, 100); }
      });
      // Cross-worker catch-up and permission revocation checks, even without an event.
      timer = setTimeout(tick, 2500);
      deadline = setTimeout(close, 50000);
    },
    cancel() { cleanup(); }
  });
  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'private, no-store, no-transform',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff'
  } });
}
