import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/access';
import { YoutubeOacPage } from '@/components/youtube-oac-page';
export const metadata = { title: 'YouTube Official Artist Channel | HYMN' };
export default async function OfficialArtistChannelPage() {
  const result = await requireUser();
  if ('error' in result) redirect('/login?next=%2Fpromotion%2Fyoutube-oac');
  return <YoutubeOacPage/>;
}
