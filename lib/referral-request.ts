// Bound streamed/chunked requests as well as Content-Length requests.
export async function referralJson(request: Request, maximumBytes = 10000): Promise<unknown> {
  if (!request.body || Number(request.headers.get("content-length") || 0) > maximumBytes) return null;
  const reader = request.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); return null; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch { return null; }
  finally { reader.releaseLock(); }
}
