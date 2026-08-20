import { redirect } from "next/navigation";
import Link from "next/link";
import { ReleaseManage } from "@/components/release-portal";
import { destinationForRole, getCurrentUserForPage } from "@/lib/access";
import { listDetailedReleasesByUser } from "@/lib/distribution-db";

export default async function ReleaseManagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ tab?: string }> }) {
  const user = await getCurrentUserForPage();
  if (!user) redirect("/login");

  const { id } = await params;
  const releaseId = Number(id);
  const releases = await listDetailedReleasesByUser(user.id);
  const release = Number.isInteger(releaseId) ? releases.find((item) => item.id === releaseId) : undefined;

  if (!release) {
    return (
      <main className="shell py-10 sm:py-12">
        <section className="surface-card mx-auto max-w-2xl p-8 text-center">
          <h1 className="text-2xl font-semibold">Release unavailable</h1>
          <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>We could not find this release or you do not have access to it.</p>
          <Link href="/dashboard/releases" className="btn-primary pressable mt-6">Back to My Releases</Link>
        </section>
      </main>
    );
  }

  const query = (await searchParams) ?? {};
  return <main className="shell py-8 sm:py-10 lg:py-12"><ReleaseManage release={release} initialTab={query.tab ?? null} /></main>;
}
// vercel trigger 5
