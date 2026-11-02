import { redirect } from 'next/navigation';
import { getCurrentUserForPage } from '@/lib/access';
import { ArtistJourney } from '@/components/artist-journey';
export default async function ArtistJourneyPage(){const user=await getCurrentUserForPage();if(!user)redirect('/login?next=%2Fartist-journey');return <ArtistJourney/>;}
