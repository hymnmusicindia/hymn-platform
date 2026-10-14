import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { PlaylistReviewMarketplace } from "@/components/playlist-review-marketplace";
export default async function PlaylistReviewAdminPage() {
  const admin = await requireAdminPermission("services.manage"); if ("error" in admin) redirect("/admin/login");
  return <main className="mx-auto max-w-7xl p-6"><h1 className="mb-6 text-3xl font-semibold">Playlist reviews</h1><PlaylistReviewMarketplace admin /></main>;
}
