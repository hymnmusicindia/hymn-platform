import { redirect } from "next/navigation";
import { AdminControlCenter } from "@/components/admin-control-center";
import { getAdminSessionForPage, getCurrentUserForPage } from "@/lib/access";
import type { User } from "@/lib/types";
import {
  getSiteSettings,
  listAllArtistProfiles,
  listAllBeats,
  listAllOrders,
  listAllReleases,
  listPartnershipLeads,
  listProducerApplications,
  listProducerProfiles,
  listUsers
} from "@/lib/db";
import { listAllDistributionOrders } from "@/lib/distribution-db";

const ADMIN_TABS = [
  "overview",
  "artists",
  "producers",
  "releases",
  "distribution-queue",
  "analytics",
  "revenue",
  "royalties",
  "contracts",
  "promotions",
  "support",
  "moderation",
  "fraud",
  "notifications",
  "team",
  "settings",
  "users",
  "payments",
  "content",
  "timed-playlists",
  "operations"
] as const;

type AdminPageProps = {
  searchParams?: Promise<{
    tab?: string;
    spotify?: string;
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

  const resolvedSearchParams = await searchParams;
  const [users, releases, beats, orders, applications, leads, distributionOrders, artistProfiles, producerProfiles, siteSettings] = await Promise.all([
    listUsers(),
    listAllReleases(),
    listAllBeats(),
    listAllOrders(),
    listProducerApplications(),
    listPartnershipLeads(),
    listAllDistributionOrders(),
    listAllArtistProfiles(),
    listProducerProfiles(),
    getSiteSettings()
  ]);
  const requestedTab = resolvedSearchParams?.tab && ADMIN_TABS.includes(resolvedSearchParams.tab as (typeof ADMIN_TABS)[number]) ? (resolvedSearchParams.tab as (typeof ADMIN_TABS)[number]) : undefined;

  return (
    <main className="shell py-16">
      <div className="mb-10 max-w-3xl">
        <span className="eyebrow">Admin panel</span>
        <h1 className="mt-5 text-5xl font-semibold" style={{ color: "var(--text)" }}>HYMN control center.</h1>
        <p className="mt-5 text-lg" style={{ color: "var(--text-muted)" }}>
          Review releases, users, payments, beats, and producer operations from one protected admin surface.
        </p>
      </div>
      <AdminControlCenter
        currentAdmin={currentAdmin}
        initialTab={requestedTab}
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
      />
    </main>
  );
}
