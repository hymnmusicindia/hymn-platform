import { redirect } from "next/navigation";
import { getCurrentUserForPage } from "@/lib/access";
import { HymnStudioPage } from "@/components/hymn-studio-page";
import type { StudioQuery } from "@/components/hymn-studio-engineers";

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<StudioQuery> }) {
  const user = await getCurrentUserForPage();
  if (!user) redirect("/login?next=%2Fstudio");
  return <HymnStudioPage user={user} query={(await searchParams) || {}}/>;
}
