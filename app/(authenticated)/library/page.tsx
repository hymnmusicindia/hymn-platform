import { redirect } from 'next/navigation';
import { getCurrentUserForPage } from '@/lib/access';
import { getBeatPurchasesByUser } from '@/lib/db';
import { getLibraryAssets } from '@/lib/user-library';
import { UserLibrary } from '@/components/user-library';

export const dynamic = 'force-dynamic';
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await getCurrentUserForPage();
  if (!user) redirect('/login?next=%2Flibrary');
  const [files, purchases] = await Promise.allSettled([getLibraryAssets(user.id), getBeatPurchasesByUser(user.id)]);
  const view = (await searchParams).view;
  return <UserLibrary assets={files.status === 'fulfilled' ? files.value : []} purchases={purchases.status === 'fulfilled' ? purchases.value : []} initialView={view === 'files' || view === 'purchases' ? view : 'all'} errors={{ files: files.status === 'rejected', purchases: purchases.status === 'rejected' }}/>;
}
