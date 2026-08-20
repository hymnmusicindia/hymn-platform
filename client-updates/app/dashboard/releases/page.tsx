import { redirect } from "next/navigation";
import { ReleasePortal } from "@/components/release-portal";
import { destinationForRole, getCurrentUserForPage } from "@/lib/access";
import { listDetailedReleasesByUser } from "@/lib/distribution-db";

export default async function ReleasePortalPage() {
  const user = await getCurrentUserForPage();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "customer") redirect(destinationForRole(user.role));

  const releases = await listDetailedReleasesByUser(user.id);

  return (
    <main className="shell py-10 sm:py-12 lg:py-14">
      <ReleasePortal releases={releases} />
    </main>
  );
}
