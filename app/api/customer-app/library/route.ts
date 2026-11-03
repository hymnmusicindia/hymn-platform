import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = await requireUser(); if ('error' in auth) return auth.error;
  const before = Number(new URL(request.url).searchParams.get('before'));
  const files = await prisma.storedAsset.findMany({ where: { ownerUserId: auth.user.id, assetType: 'private_audio_master', category: 'TRACK_AUDIO_MASTER', uploadStatus: 'ready', deletedAt: null, ...(Number.isSafeInteger(before) && before > 0 ? { id: { lt: before } } : {}) }, orderBy: { id: 'desc' }, take: 31, select: { id: true, originalFilename: true, safeFilename: true, mimeType: true, byteSize: true, createdAt: true, releaseId: true } });
  return NextResponse.json({ files: files.slice(0, 30).map(file => ({ ...file, downloadPath: `/api/assets/${file.id}/download?filename=${encodeURIComponent(file.safeFilename)}` })), nextCursor: files.length > 30 ? files[29].id : null }, { headers: { 'Cache-Control': 'private, no-store' } });
}
