import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { prisma } from '@/lib/prisma';

export async function DELETE() {
  const auth = await requireUser();
  if ('error' in auth) return auth.error;
  try {
    const result = await prisma.storedAsset.updateMany({
      where: { ownerUserId: auth.user.id, assetType: 'private_audio_master', uploadStatus: 'ready', deletedAt: null, category: 'TRACK_AUDIO_MASTER' },
      data: { category: 'TRACK_AUDIO_MASTER_LIBRARY_HIDDEN' },
    });
    return NextResponse.json({ removed: result.count }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Audio library cleanup failed', { userId: auth.user.id, error });
    return NextResponse.json({ error: 'Your files could not be removed. Please try again.' }, { status: 500 });
  }
}
