import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getCurrentUserForPage} from '@/lib/access';
import {getBeatPurchasesByUser} from '@/lib/db';
import {BeatPurchases} from '@/components/beat-purchases';
import {PurchaseRefresh} from '@/components/beat-purchase-detail';
export const dynamic='force-dynamic';
export default async function BeatPurchasesPage(){
  const user=await getCurrentUserForPage();if(!user)redirect('/login');
  const purchases=await getBeatPurchasesByUser(user.id);
  return <main className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-7 sm:py-10"><div className="mb-6 flex items-center justify-between gap-4"><Link href="/dashboard" className="text-sm text-[var(--text-muted)]">← Dashboard</Link><PurchaseRefresh/></div><BeatPurchases purchases={purchases}/></main>;
}
