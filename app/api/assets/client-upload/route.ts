import { get, issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { validatePrivateUpload, type PrivateAssetType } from '@/lib/private-storage';

const uploadPolicies: Record<string, { maximumSizeInBytes: number; allowedContentTypes: string[] }> = {
  private_audio_master: { maximumSizeInBytes: 500 * 1024 * 1024, allowedContentTypes: ['audio/wav', 'audio/x-wav', 'audio/mpeg'] },
  private_studio_source: { maximumSizeInBytes: 2 * 1024 * 1024 * 1024, allowedContentTypes: ['audio/wav', 'audio/x-wav', 'audio/flac', 'audio/mpeg', 'application/zip'] },
  private_studio_delivery: { maximumSizeInBytes: 500 * 1024 * 1024, allowedContentTypes: ['audio/wav', 'audio/x-wav', 'audio/flac', 'audio/mpeg', 'application/zip'] },
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
         const studioAsset = payload.assetType === 'private_studio_source' || payload.assetType === 'private_studio_delivery';
         if (studioAsset !== Boolean(payload.studioOrderId)) throw new Error("Studio uploads require exactly one Studio order context.");
         if (!Number.isFinite(payload.byteSize) || payload.byteSize < 1 || payload.byteSize > policy.maximumSizeInBytes) throw new Error("Private asset size is invalid.");
         if (payload.releaseId) {
           const ownedRelease = await prisma.release.count({ where: { id: Number(payload.releaseId), userId: result.user.id } });
           if (!ownedRelease) throw new Error("Release not found.");
         }
         if (payload.studioOrderId) {
           const order = await prisma.studioServiceOrder.findUnique({ where: { publicId: String(payload.studioOrderId) }, include: { engineerParty: { select: { claimedByUserId: true } } } });
           const participant = order && (order.customerId === result.user.id || order.engineerParty.claimedByUserId === result.user.id);
           const expected = payload.assetType === 'private_studio_source' ? order?.customerId : order?.engineerParty.claimedByUserId;
           if (!participant || expected !== result.user.id) throw new Error("Studio order not found or upload role is invalid.");
         }

         const tokenPayload = JSON.stringify({ userId: result.user.id, assetType: payload.assetType, releaseId: payload.releaseId, studioOrderId: payload.studioOrderId, mimeType: payload.mimeType, originalFilename: payload.originalFilename, byteSize: payload.byteSize });
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
         const { userId, assetType, releaseId, studioOrderId, mimeType, originalFilename, byteSize } = JSON.parse(tokenPayload || '{}');
         const safeFilename = String(originalFilename || blob.pathname.split('/').pop() || 'asset').replace(/[^a-zA-Z0-9._-]/g, '_');
         const sample = await get(blob.url, { access: "private", headers: { Range: "bytes=0-1048575" } });
         if (!sample?.stream) throw new Error("Could not verify uploaded file content.");
         validatePrivateUpload({ ownerUserId: Number(userId), releaseId: releaseId ? Number(releaseId) : undefined, assetType: assetType as PrivateAssetType, fileName: safeFilename, mimeType: String(mimeType), bytes: Buffer.from(await new Response(sample.stream).arrayBuffer()) });

         const asset = await prisma.storedAsset.upsert({
           where: { objectKey: blob.url },
           create: {
             ownerUserId: userId,
             releaseId: releaseId ? Number(releaseId) : undefined,
             entityType: studioOrderId ? "STUDIO_ORDER" : undefined,
             entityId: studioOrderId ? String(studioOrderId) : undefined,
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
         if (studioOrderId) {
           await prisma.$transaction(async tx => {
             const order = await tx.studioServiceOrder.findUniqueOrThrow({ where: { publicId: String(studioOrderId) } });
             await tx.$executeRaw`SELECT pg_advisory_xact_lock(${order.id})`;
             const category = assetType === 'private_studio_source' ? 'SOURCE' : 'DELIVERY';
             const latest = await tx.studioFile.findFirst({ where: { orderId: order.id, category }, orderBy: { version: 'desc' }, select: { version: true } });
             await tx.studioFile.upsert({ where: { assetId: asset.id }, create: { orderId: order.id, assetId: asset.id, uploaderId: Number(userId), category, version: (latest?.version ?? 0) + 1 }, update: { status: 'READY' } });
             if (category === 'SOURCE' && ['ACCEPTED', 'AWAITING_SOURCE_FILES'].includes(order.status)) {
               const moved = await tx.studioServiceOrder.updateMany({ where: { id: order.id, status: order.status }, data: { status: 'IN_PROGRESS', startedAt: new Date(), deliveryDueAt: new Date(Date.now() + order.turnaroundDays * 86400000) } });
               if (moved.count) {
                 await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: 'IN_PROGRESS', actorUserId: Number(userId), actorType: 'CUSTOMER', reason: 'Source files uploaded', correlationId: `source-upload:${asset.id}` } });
                 await tx.studioMessage.create({ data: { orderId: order.id, kind: 'SYSTEM', body: 'Source files uploaded. Project started.', idempotencyKey: `source-upload:${asset.id}` } });
                 await tx.growthEvent.createMany({ data: [{ event: 'source_uploaded', key: `studio:${order.id}:source:${asset.id}`, source: 'server', userId: Number(userId), properties: { studio_order_id: order.id, asset_id: asset.id } }], skipDuplicates: true });
               }
             }
           });
         }
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Blob client upload authorization failed", { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not authorize file upload." }, { status: 400 });
  }
}
// vercel trigger 13
