import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireUser } from "@/lib/access";

export async function POST(request: Request) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const body = await request.json() as HandleUploadBody;
  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac"],
        maximumSizeInBytes: 500 * 1024 * 1024,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ userId: user.user.id, pathname })
      }),
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.info("Direct audio upload completed", { url: blob.url, owner: JSON.parse(tokenPayload ?? "{}").userId });
      }
    });
    return NextResponse.json(response);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not authorize upload." }, { status: 400 }); }
}
