import { NextResponse } from "next/server";
import { requireStudioUser as requireUser } from "@/lib/studio-access";
import { createStudioUpload, verifyStudioUpload, studioUploadStatus, writeStudioChunk, completeStudioUpload, studioChunkSize } from "@/lib/studio-uploads";
import { studioError } from "@/lib/studio-errors";
import { consumeRateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  try {
    if (Number(request.headers.get("content-length")) > studioChunkSize + 64 * 1024) return NextResponse.json({ error: "Upload chunk is too large." }, { status: 413 });
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const form = await request.formData(), chunk = form.get("chunk");
      if (!(chunk instanceof File) || chunk.size > studioChunkSize) throw new Error("Invalid upload chunk.");
      await writeStudioChunk(verifyStudioUpload(String(form.get("token")), auth.user.id), Number(form.get("index")), Buffer.from(await chunk.arrayBuffer()), String(form.get("checksum")));
      return NextResponse.json({ received: true });
    }
    const body = await request.json();
    if (body.action === "create") {
      const rate = await consumeRateLimit({ scope: "studio-upload", identity: String(auth.user.id), limit: 60, windowSeconds: 3600 });
      if (!rate.allowed) return NextResponse.json({ error: "Upload limit reached. Try again later." }, { status: 429 });
      return NextResponse.json(await createStudioUpload(auth.user.id, body), { status: 201 });
    }
    const upload = verifyStudioUpload(body.token, auth.user.id);
    if (body.action === "status") return NextResponse.json({ uploadedChunks: await studioUploadStatus(upload) });
    if (body.action === "complete") return NextResponse.json({ asset: await completeStudioUpload(upload) }, { status: 201 });
    throw new Error("Unknown upload action.");
  } catch (error) { return NextResponse.json({ error: studioError(error) }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
