import {DesktopConnect} from '@/components/admin-desktop-connect';
import {privateRobots} from '@/lib/seo';
export const metadata={title:'Connect HYMN Admin OS',robots:privateRobots,referrer:'no-referrer' as const};
export default function Page(){return <DesktopConnect/>;}
