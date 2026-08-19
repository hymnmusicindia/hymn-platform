import { redirect } from "next/navigation";
import { ReleasePortal } from "@/components/release-portal";
import { destinationForRole, getCurrentUserForPage } from "@/lib/access";
import { listDetailedReleasesByUser } from "@/lib/distribution-db";

export default async function ReleasePortalPage({ searchParams }: { searchParams?: Promise<{ releaseId?: string; panel?: string; tab?: string }> }) {
  const user = await getCurrentUserForPage();

  if (!user) {
    redirect("/login");
  }

  const params = (await searchParams) ?? {};
  const releases = await listDetailedReleasesByUser(user.id);
  const selectedReleaseId = params.releaseId ? Number(params.releaseId) : null;

  return (
    <main className="shell py-10 sm:py-12 lg:py-14">
      <ReleasePortal releases={releases} selectedReleaseId={Number.isInteger(selectedReleaseId) ? selectedReleaseId : null} initialPanel={params.panel ?? null} initialTab={params.tab ?? null} />
    </main>
  );
}

// vercel trigger
