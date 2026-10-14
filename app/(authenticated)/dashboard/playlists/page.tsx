import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserForPage } from "@/lib/access";
import { PlaylistReviewMarketplace } from "@/components/playlist-review-marketplace";
export const metadata = { title: "Explore playlists | HYMN" };
export default async function PlaylistsPage() {
  if (!await getCurrentUserForPage()) redirect('/login');
  return <main className="hymn-dashboard-shell"><Link href="/dashboard?tab=promotions">← Promotions</Link><h1 className="my-6 text-3xl font-semibold">Explore playlists</h1><PlaylistReviewMarketplace page /></main>;
}
