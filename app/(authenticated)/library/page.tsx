import { redirect } from 'next/navigation';
import { getCurrentUserForPage } from '@/lib/access';
import { getBeatPurchasesByUser } from '@/lib/db';
import { getLibraryAssets } from '@/lib/user-library';
import { getAudioLibraryStorage, AUDIO_LIBRARY_STORAGE_LIMITS } from '@/lib/audio-library-storage';
import { UserLibrary } from '@/components/user-library';

export const dynamic = 'force-dynamic';
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await getCurrentUserForPage();
  if (!user) redirect('/login?next=%2Flibrary');
  const [files, purchases, storage] = await Promise.allSettled([getLibraryAssets(user.id), getBeatPurchasesByUser(user.id), getAudioLibraryStorage(user.id)]);
  const view = (await searchParams).view;
  const storageSummary = storage.status === 'fulfilled' ? storage.value : { usedBytes: 0, limitBytes: AUDIO_LIBRARY_STORAGE_LIMITS.free, percent: 0, plan: null, remainingBytes: AUDIO_LIBRARY_STORAGE_LIMITS.free };
  return <UserLibrary assets={files.status === 'fulfilled' ? files.value : []} purchases={purchases.status === 'fulfilled' ? purchases.value : []} storage={storageSummary} initialView={view === 'files' || view === 'purchases' ? view : 'all'} errors={{ files: files.status === 'rejected', purchases: purchases.status === 'rejected' }}/>;
}
