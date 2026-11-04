export class RequestBodyError extends Error {
  constructor(message: string, readonly status: 400 | 413) { super(message); }
}

/** Enforce the byte budget while reading, including requests without Content-Length. */
export async function readJsonBody(request: Request, maximumBytes = 4096): Promise<unknown> {
  if (!request.body) throw new RequestBodyError("JSON content required.", 400);
  const length = request.headers.get("content-length");
  if (length && Number(length) > maximumBytes) throw new RequestBodyError("Request too large.", 413);
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyError("Request too large.", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch (error) {
    if (error instanceof RequestBodyError) throw error;
    throw new RequestBodyError("Invalid JSON.", 400);
  } finally { reader.releaseLock(); }
}
