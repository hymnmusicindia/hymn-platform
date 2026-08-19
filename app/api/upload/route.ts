import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Authenticate the user
        const session = await getSession();
        if (!session || !session.sub) {
          throw new Error("Unauthorized");
        }

        return {
          allowedContentTypes: ["audio/mpeg", "audio/wav", "image/jpeg", "image/png", "application/pdf"],
          tokenPayload: JSON.stringify({
            userId: session.sub,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // You could update a database here if you wanted, but we will save
        // the URLs when the main form is submitted instead.
        console.log("Upload completed", blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 } // The webhook will retry 5 times waiting for a 200
    );
  }
}
