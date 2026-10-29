import {notFound,redirect} from 'next/navigation';
import {getCurrentUserForPage} from '@/lib/access';
import {getBeatPurchaseDetails} from '@/lib/beat-purchase-details';
import {BeatPurchaseDetail} from '@/components/beat-purchase-detail';
export const dynamic='force-dynamic';
export default async function BeatPurchasePage({params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUserForPage();if(!user)redirect('/login');
  const purchase=await getBeatPurchaseDetails(Number((await params).id),user.id);if(!purchase)notFound();
  return <BeatPurchaseDetail purchase={purchase}/>;
}
