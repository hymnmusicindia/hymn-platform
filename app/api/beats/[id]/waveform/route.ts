import { beatWaveform } from "@/lib/beat-waveform";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const source = new URL(request.url).searchParams.get("source");
  const noStore = { "Cache-Control": "no-store" };
  if (!Number.isSafeInteger(id) || id <= 0 || !["preview", "master"].includes(source || "")) return new Response(null, { status: 404, headers: noStore });
  try {
    const result = await beatWaveform(id, source as "preview" | "master");
    if (!result) return new Response(null, { status: 404, headers: noStore });
    if (result.state !== "ready") return Response.json({ state: result.state }, {
      status: result.state === "busy" ? 202 : 503, headers: { ...noStore, "Retry-After": result.state === "busy" ? "2" : "60" }
    });
    const headers = { "Cache-Control": "private, no-cache", ETag: result.etag, "X-Content-Type-Options": "nosniff" };
    if (request.headers.get("if-none-match") === result.etag) return new Response(null, { status: 304, headers });
    return Response.json(result.data, { headers });
  } catch {
    return Response.json({ state: "retry" }, { status: 503, headers: { ...noStore, "Retry-After": "60" } });
  }
}
