import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ReleaseChangeRequestQueue } from "@/components/release-change-request-queue";

export default async function ReleaseChangeRequestsPage() {
  const admin = await requireAdminPermission("updates.review");
  if ("error" in admin) redirect("/admin/login");
  const shell = (title: string, copy: string) => <main className="mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-28 sm:px-8 sm:pt-32"><h1 className="text-3xl font-semibold">Release changes and takedowns</h1><section className="surface-card mt-6"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{copy}</p><a className="btn-outline mt-5 inline-flex" href="/admin">Back to Admin Portal</a></section></main>;
  if (!process.env.DATABASE_URL?.trim()) return shell("Database connection required", "Release-change review will become available after a PostgreSQL DATABASE_URL is configured on the server.");
  try {
    const requests = await prisma.releaseChangeRequest.findMany({ orderBy: { submittedAt: "asc" }, take: 100, include: { release: { select: { title: true, artistName: true, status: true } }, events: { orderBy: { createdAt: "asc" } } } });
    return <main className="mx-auto min-h-screen max-w-7xl px-5 pb-16 pt-28 sm:px-8 sm:pt-32"><h1 className="text-3xl font-semibold">Release changes and takedowns</h1><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Review tracked customer requests, record decisions, and preserve partner execution references.</p><ReleaseChangeRequestQueue initialRequests={JSON.parse(JSON.stringify(requests))} /></main>;
  } catch {
    return shell("Database unavailable", "HYMN could not connect to the release operations database. Verify DATABASE_URL and apply the pending Prisma migrations.");
  }
}
// vercel trigger 9

// vercel trigger 14
