import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ManualReleaseManager } from "@/components/manual-release-manager";

export default async function ManualReleasesPage() {
  const admin = await requireAdminPermission("releases.read");
  if ("error" in admin) redirect("/admin/login");

  const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());
  const [users, releases] = databaseConfigured
    ? await Promise.all([
        prisma.user.findMany({
          where: { status: "ACTIVE" },
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            artistCards: {
              where: { archivedAt: null },
              select: { id: true, artistName: true, imageUrl: true },
            },
          },
          orderBy: { name: "asc" },
          take: 1000,
        }),
        prisma.release.findMany({
          where: { releaseSource: "ADMIN_MANUAL" },
          include: {
            owner: { select: { id: true, name: true, email: true } },
            artistProfile: { select: { id: true, artistName: true } },
            tracks: { orderBy: { trackNumber: "asc" } },
          },
          orderBy: { updatedAt: "desc" },
          take: 250,
        }),
      ])
    : [[], []];

  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-5 pb-20 pt-28 sm:px-8">
      {!databaseConfigured ? (
        <section className="surface-card mb-6 border-amber-500/40 p-5">
          <h1 className="text-lg font-semibold">Database configuration required</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Manual releases use the canonical PostgreSQL catalog. Add a PostgreSQL DATABASE_URL to .env.local, apply the Prisma migration, and restart the development server.
          </p>
        </section>
      ) : null}
      <ManualReleaseManager
        initialUsers={users}
        initialReleases={JSON.parse(JSON.stringify(releases))}
        canManage={databaseConfigured && ("permissions" in admin ? admin.permissions.includes("releases.override") : true)}
      />
    </main>
  );
}

// vercel trigger 15
