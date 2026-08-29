import { redirect } from "next/navigation";
import { AdminControlCenter } from "@/components/admin-control-center";
import { getAdminAccessForPage, getAdminSessionForPage, getCurrentUserForPage } from "@/lib/access";
import type { User } from "@/lib/types";
import {
  getSiteSettings,
  listAllArtistProfiles,
  listAllBeats,
  listLatestNotifications,
  listAllOrders,
  listAllSupportTickets,
  listPartnershipLeads,
  listProducerApplications,
  listProducerProfiles,
  listUsers
} from "@/lib/db";
import { listAllDistributionOrders, listAllDetailedReleases } from "@/lib/distribution-db";

const ADMIN_TABS = [
  "overview",
  "artists",
  "producers",
  "releases",
  "distribution-queue",
  "delivery",
  "analytics",
  "revenue",
  "royalties",
  "earnings-entry",
  "contracts",
  "promotions",
  "support",
  "fraud",
  "notifications",
  "team",
  "settings",
  "users",
  "payments",
  "content",
  "timed-playlists",
  "operations",
  "reviews",
  "activity"
] as const;

type AdminPageProps = {
  searchParams?: Promise<{
    tab?: string;
    spotify?: string;
    beatId?: string;
  }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const signedInUser = await getCurrentUserForPage();
  const adminSession = await getAdminSessionForPage();
  const localAdmin: User | null = adminSession
    ? {
        id: 1,
        name: "HYMN Admin",
        email: "admin@local.hymn",
        googleId: "local-admin",
        role: "admin",
        referralCode: "HYMNADMIN",
        referralCredits: 0,
        referredBy: null,
        firstPaymentRewarded: false,
        createdAt: new Date().toISOString()
      }
    : null;
  const currentAdmin = signedInUser?.role === "admin" ? signedInUser : localAdmin;

  if (!currentAdmin) redirect("/admin/login");
  const adminAccess = await getAdminAccessForPage();

  const resolvedSearchParams = await searchParams;
  const [users, releases, beats] = await Promise.all([listUsers(), listAllDetailedReleases(), listAllBeats()]);
  const [orders, applications, leads] = await Promise.all([listAllOrders(), listProducerApplications(), listPartnershipLeads()]);
  const [distributionOrders, artistProfiles, producerProfiles] = await Promise.all([listAllDistributionOrders(), listAllArtistProfiles(), listProducerProfiles()]);
  const [siteSettings, notifications, supportTickets] = await Promise.all([getSiteSettings(), listLatestNotifications(50), listAllSupportTickets()]);
  const requestedTab = resolvedSearchParams?.tab && ADMIN_TABS.includes(resolvedSearchParams.tab as (typeof ADMIN_TABS)[number]) ? (resolvedSearchParams.tab as (typeof ADMIN_TABS)[number]) : undefined;

  return (
    <main className="admin-panel-shell py-6 sm:py-8">
      <div className="mb-4 flex justify-end"><a className="btn-secondary" href="/admin/releases/manual">Manual Releases</a></div>
      <AdminControlCenter
        currentAdmin={currentAdmin}
        adminAccess={adminAccess ?? { role: "admin", permissions: [] }}
        initialTab={requestedTab}
        initialBeatId={Number.isInteger(Number(resolvedSearchParams?.beatId)) ? Number(resolvedSearchParams?.beatId) : undefined}
        initialReleases={releases}
        initialBeats={beats}
        initialOrders={orders}
        initialUsers={users}
        initialApplications={applications}
        initialLeads={leads}
        initialDistributionOrders={distributionOrders}
        initialArtistProfiles={artistProfiles}
        initialProducerProfiles={producerProfiles}
        initialSiteSettings={siteSettings}
        initialNotifications={notifications}
        initialSupportTickets={supportTickets}
      />
    </main>
  );
}

// vercel trigger

// vercel trigger 2
// vercel trigger 7

// vercel trigger 11

// vercel trigger 14
