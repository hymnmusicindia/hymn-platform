import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/access";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const rate = await consumeRateLimit({ scope: "audio-upload-sign", identity: String(user.user.id), limit: 30, windowSeconds: 60 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Upload limit reached. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Private audio uploads are disabled until durable private storage is configured. Public blob URLs are not accepted for unreleased masters." }, { status: 503 });
  }
  const body = await request.json() as HandleUploadBody;
  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ["audio/mpeg", "audio/wav", "audio/x-wav"],
        maximumSizeInBytes: 500 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: user.user.id, pathname })
      }),
      onUploadCompleted: async ({ tokenPayload }) => {
        console.info("Development audio upload completed", { owner: JSON.parse(tokenPayload ?? "{}").userId });
      }
    });
    return NextResponse.json(response);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not authorize upload." }, { status: 400 }); }
}
// vercel trigger 9
