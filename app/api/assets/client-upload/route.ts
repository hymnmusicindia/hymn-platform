import { get, issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { validatePrivateUpload, type PrivateAssetType } from '@/lib/private-storage';

const uploadPolicies: Record<string, { maximumSizeInBytes: number; allowedContentTypes: string[] }> = {
  private_audio_master: { maximumSizeInBytes: 500 * 1024 * 1024, allowedContentTypes: ['audio/wav', 'audio/x-wav', 'audio/mpeg'] },
  private_unreleased_artwork: { maximumSizeInBytes: 20 * 1024 * 1024, allowedContentTypes: ['image/jpeg'] },
  private_cover_licence: { maximumSizeInBytes: 20 * 1024 * 1024, allowedContentTypes: ['application/pdf', 'image/jpeg', 'image/png'] },
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload) => {
         const result = await requireUser();
         if ("error" in result) throw new Error("Unauthorized");
         
         const payload = JSON.parse(clientPayload || '{}');
         const policy = uploadPolicies[payload.assetType];
         if (!policy || !policy.allowedContentTypes.includes(payload.mimeType)) throw new Error("Unsupported private asset type.");
         if (!Number.isFinite(payload.byteSize) || payload.byteSize < 1 || payload.byteSize > policy.maximumSizeInBytes) throw new Error("Private asset size is invalid.");
         if (payload.releaseId) {
           const ownedRelease = await prisma.release.count({ where: { id: Number(payload.releaseId), userId: result.user.id } });
           if (!ownedRelease) throw new Error("Release not found.");
         }

         const tokenPayload = JSON.stringify({ userId: result.user.id, assetType: payload.assetType, releaseId: payload.releaseId, mimeType: payload.mimeType, originalFilename: payload.originalFilename, byteSize: payload.byteSize });
         const token = await issueSignedToken({
           pathname,
           operations: ['put'],
           allowedContentTypes: policy.allowedContentTypes,
           maximumSizeInBytes: policy.maximumSizeInBytes,
         });
         return {
           token,
           urlOptions: { allowedContentTypes: policy.allowedContentTypes, maximumSizeInBytes: policy.maximumSizeInBytes, addRandomSuffix: true, tokenPayload },
         };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
         const { userId, assetType, releaseId, mimeType, originalFilename, byteSize } = JSON.parse(tokenPayload || '{}');
         const safeFilename = String(originalFilename || blob.pathname.split('/').pop() || 'asset').replace(/[^a-zA-Z0-9._-]/g, '_');
         const sample = await get(blob.url, { access: "private", headers: { Range: "bytes=0-1048575" } });
         if (!sample?.stream) throw new Error("Could not verify uploaded file content.");
         validatePrivateUpload({ ownerUserId: Number(userId), releaseId: releaseId ? Number(releaseId) : undefined, assetType: assetType as PrivateAssetType, fileName: safeFilename, mimeType: String(mimeType), bytes: Buffer.from(await new Response(sample.stream).arrayBuffer()) });

         await prisma.storedAsset.upsert({
           where: { objectKey: blob.url },
           create: {
             ownerUserId: userId,
             releaseId: releaseId ? Number(releaseId) : undefined,
             assetType,
             storageProvider: "vercel_blob",
             objectKey: blob.url,
             originalFilename: String(originalFilename || safeFilename),
             safeFilename,
             mimeType: mimeType,
             byteSize: Number(byteSize),
             checksum: blob.etag,
             accessClassification: "private"
           },
           update: { uploadStatus: "ready", deletedAt: null }
         });
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Blob client upload authorization failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not authorize file upload." }, { status: 400 });
  }
}
// vercel trigger 13
