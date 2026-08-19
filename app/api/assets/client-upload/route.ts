import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
         const result = await requireUser();
         if ("error" in result) throw new Error("Unauthorized");
         
         const payload = JSON.parse(clientPayload || '{}');
         if (!payload.assetType || !payload.mimeType) throw new Error("Missing asset details");

         return {
           allowedContentTypes: ['audio/wav', 'audio/x-wav', 'audio/flac', 'audio/mpeg', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/zip', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
           tokenPayload: JSON.stringify({ userId: result.user.id, assetType: payload.assetType, releaseId: payload.releaseId, mimeType: payload.mimeType }),
         };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
         const { userId, assetType, releaseId, mimeType } = JSON.parse(tokenPayload || '{}');
         
         await prisma.storedAsset.create({
           data: {
             ownerUserId: userId,
             releaseId: releaseId ? Number(releaseId) : undefined,
             assetType,
             storageProvider: "vercel_blob",
             objectKey: blob.url,
             originalFilename: blob.pathname,
             safeFilename: blob.pathname.split('/').pop() || 'asset',
             mimeType: mimeType,
             byteSize: 0, 
             checksum: "", 
             accessClassification: "private"
           }
         });
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
// vercel trigger 13
