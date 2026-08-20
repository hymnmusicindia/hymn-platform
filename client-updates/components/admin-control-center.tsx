"use client";

import { useMemo, useState, useTransition } from "react";
import { AdminContentManager } from "@/components/admin-content-manager";
import { AdminTimedPlaylistManager } from "@/components/admin-timed-playlist-manager";
import { DashboardFrame } from "@/components/dashboard-frame";
import type { ArtistProfile, Beat, DistributionLog, DistributionOrder, Order, PartnershipLead, ProducerApplication, ProducerProfile, Release, ReleaseAuditLog, SiteSettings, User, UserRole } from "@/lib/types";

function formatMoney(amount: number) {
  return `Rs ${amount.toLocaleString("en-IN")}`;
}

function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="metric-card fade-up">
      <p className="text-sm" style={{ color: "var(--text-soft)" }}>{label}</p>
      <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
      {detail ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{detail}</p> : null}
    </div>
  );
}

function StatusPill({ label, active = true }: { label: string; active?: boolean }) {
  return <span className={active ? "status-pill status-pill-active" : "status-pill"}>{label}</span>;
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="surface-list-item p-4">
      <span className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>{label}</span>
      <p className="mt-2 break-words text-sm font-semibold" style={{ color: "var(--text)" }}>{value || "-"}</p>
    </div>
  );
}

function SurfaceSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
          {description ? <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{description}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return <p className="text-sm" style={{ color: "var(--text-soft)" }}>{copy}</p>;
}

type AdminTab =
  | "overview"
  | "artists"
  | "producers"
  | "releases"
  | "distribution-queue"
  | "analytics"
  | "revenue"
  | "royalties"
  | "contracts"
  | "promotions"
  | "support"
  | "moderation"
  | "fraud"
  | "notifications"
  | "team"
  | "settings"
  | "users"
  | "payments"
  | "content"
  | "timed-playlists"
  | "operations";

export function AdminControlCenter({
  currentAdmin,
  initialTab,
  initialReleases,
  initialBeats,
  initialOrders,
  initialUsers,
  initialApplications,
  initialLeads,
  initialDistributionOrders,
  initialArtistProfiles,
  initialProducerProfiles,
  initialSiteSettings
}: {
  currentAdmin: User;
  initialTab?: AdminTab;
  initialReleases: Release[];
  initialBeats: Beat[];
  initialOrders: Order[];
  initialUsers: User[];
  initialApplications: ProducerApplication[];
  initialLeads: PartnershipLead[];
  initialDistributionOrders: DistributionOrder[];
  initialArtistProfiles: ArtistProfile[];
  initialProducerProfiles: ProducerProfile[];
  initialSiteSettings: SiteSettings;
}) {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab ?? "overview");
  const [releases, setReleases] = useState(initialReleases);
  const [beats, setBeats] = useState(initialBeats);
  const [users, setUsers] = useState(initialUsers);
  const [applications, setApplications] = useState(initialApplications);
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(initialReleases[0]?.id ?? null);
  const [distributionDetails, setDistributionDetails] = useState<Record<number, { logs: DistributionLog[]; audits: ReleaseAuditLog[] }>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const distributionRevenue = initialDistributionOrders.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.amount, 0);
  const commerceRevenue = initialOrders.filter((order) => order.paymentStatus === "paid").reduce((sum, order) => sum + order.amount, 0);
  const pendingReviews = releases.filter((release) => ["submitted", "in_queue", "under_review"].includes(release.status)).length;
  const selectedRelease = releases.find((release) => release.id === selectedReleaseId) ?? releases[0] ?? null;
  const selectedDistributionDetails = selectedRelease ? distributionDetails[selectedRelease.id] : undefined;

  const releaseCountByUser = useMemo(() => {
    const counts = new Map<number, number>();
    releases.forEach((release) => counts.set(release.userId, (counts.get(release.userId) ?? 0) + 1));
    return counts;
  }, [releases]);

  const latestUserActivity = useMemo(() => {
    const stamps = new Map<number, string>();
    releases.forEach((release) => {
      const current = stamps.get(release.userId);
      if (!current || new Date(release.createdAt).getTime() > new Date(current).getTime()) {
        stamps.set(release.userId, release.createdAt);
      }
    });
    initialOrders.forEach((order) => {
      const current = stamps.get(order.userId);
      if (!current || new Date(order.createdAt).getTime() > new Date(current).getTime()) {
        stamps.set(order.userId, order.createdAt);
      }
    });
    return stamps;
  }, [initialOrders, releases]);

  function updateReleaseStatus(id: number, status: Release["status"]) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/update-status/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: `Status set to ${status}` })
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.release) setReleases((items) => items.map((item) => (item.id === id ? data.release : item)));
        setFeedback(data.error || "Could not update release.");
        return;
      }
      setReleases((items) => items.map((item) => (item.id === id ? data.release : item)));
      setFeedback(`Release updated: ${data.release.trackName}`);
      void loadDistributionDetails(id);
    });
  }

  async function loadDistributionDetails(id: number) {
    const response = await fetch(`/api/admin/releases/${id}/distribution`);
    const data = await response.json();
    if (!response.ok) {
      setFeedback(data.error || "Could not load distribution details.");
      return;
    }
    setDistributionDetails((current) => ({ ...current, [id]: { logs: data.distributionLogs ?? [], audits: data.auditLogs ?? [] } }));
  }

  function retryDistribution(id: number) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/releases/${id}/distribution`, { method: "POST" });
      const data = await response.json();
      if (data.release) setReleases((items) => items.map((item) => (item.id === id ? data.release : item)));
      await loadDistributionDetails(id);
      setFeedback(response.ok ? "Distribution retry submitted." : data.error || "Distribution retry failed.");
    });
  }

  function toggleBeat(beat: Beat) {
    startTransition(async () => {
      const response = await fetch(`/api/producer/beats/${beat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !beat.enabled })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update beat.");
        return;
      }
      setBeats((items) => items.map((item) => (item.id === beat.id ? data.beat : item)));
      setFeedback(`Beat updated: ${data.beat.title}`);
    });
  }

  function updateRole(user: User, role: UserRole) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update user role.");
        return;
      }
      setUsers((items) => items.map((item) => (item.id === user.id ? data.user : item)));
      setFeedback(`Role updated for ${data.user.name}`);
    });
  }

  function reviewApplication(id: number, status: "approved" | "rejected") {
    startTransition(async () => {
      const response = await fetch(`/api/admin/producer-applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: `Application ${status}` })
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not review application.");
        return;
      }
      setApplications((items) => items.map((item) => (item.id === id ? data.application : item)));
      if (status === "approved") {
        setUsers((items) => items.map((item) => (item.id === data.application.userId ? { ...item, role: "producer" } : item)));
      }
      setFeedback(`Application ${status}.`);
    });
  }

  return (
    <DashboardFrame
      eyebrow="Admin panel"
      title="HYMN control center"
      subtitle={`${currentAdmin.name} Â· ${currentAdmin.email}`}
      navItems={[
        { key: "overview", label: "Dashboard Overview", description: "Platform health" },
        { key: "artists", label: "Artists", description: "Profiles and creators" },
        { key: "producers", label: "Producers", description: "Applications and catalog" },
        { key: "releases", label: "Releases", description: "Approval queue" },
        { key: "distribution-queue", label: "Distribution Queue", description: "DSP delivery" },
        { key: "analytics", label: "Analytics", description: "Streams and growth" },
        { key: "revenue", label: "Revenue", description: "Payments and invoices" },
        { key: "royalties", label: "Royalties & Payouts", description: "Payout controls" },
        { key: "contracts", label: "Contracts", description: "Agreements and splits" },
        { key: "promotions", label: "Promotions", description: "Campaign ops" },
        { key: "support", label: "Support Tickets", description: "Inbound help" },
        { key: "moderation", label: "Content Moderation", description: "Artwork and metadata" },
        { key: "fraud", label: "Fraud Detection", description: "Risk signals" },
        { key: "notifications", label: "Notifications", description: "Platform messaging" },
        { key: "team", label: "Team Management", description: "Staff operations" },
        { key: "settings", label: "Settings", description: "Platform config" }
      ]}
      activeKey={activeTab}
      onSelect={setActiveTab}
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={users.length} />
        <StatCard label="Total releases" value={releases.length} />
        <StatCard label="Pending reviews" value={pendingReviews} />
        <StatCard label="Revenue" value={formatMoney(distributionRevenue + commerceRevenue)} detail={`${formatMoney(distributionRevenue)} distribution + ${formatMoney(commerceRevenue)} commerce`} />
      </section>

      {feedback ? <p className="text-sm" style={{ color: "var(--text)" }}>{feedback}</p> : null}

      {activeTab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SurfaceSection title="Pending review queue" description="The submissions needing action right now.">
            <div className="grid gap-4">
              {releases.filter((release) => ["submitted", "in_queue", "under_review"].includes(release.status)).slice(0, 6).map((release) => (
                <article key={release.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{release.releaseTitle}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{release.artistName} / {release.releaseType.toUpperCase()}</p>
                    </div>
                    <StatusPill label={release.status.replace(/_/g, " ")} />
                  </div>
                </article>
              ))}
              {pendingReviews === 0 ? <EmptyState copy="No releases are waiting on review." /> : null}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Recent distribution payments" description="Track the pay-per-release flow and subscription checkout states.">
            <div className="grid gap-4">
              {initialDistributionOrders.slice(0, 6).map((order) => (
                <article key={order.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>Order #{order.id}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{order.plan} / {formatMoney(order.amount)}</p>
                    </div>
                    <StatusPill label={order.paymentStatus} active={order.paymentStatus === "paid"} />
                  </div>
                </article>
              ))}
              {initialDistributionOrders.length === 0 ? <EmptyState copy="No distribution checkouts yet." /> : null}
            </div>
          </SurfaceSection>
        </div>
      ) : null}

      {(activeTab === "releases" || activeTab === "distribution-queue" || activeTab === "moderation") ? (
        <div className="grid gap-6 xl:grid-cols-[0.92fr,1.08fr]">
          <SurfaceSection title="All submissions" description="Open a release to inspect assets and change review status.">
            <div className="grid gap-4">
              {releases.map((release) => (
                <button key={release.id} type="button" onClick={() => { setSelectedReleaseId(release.id); void loadDistributionDetails(release.id); }} className="surface-list-item pressable p-4 text-left" style={selectedRelease?.id === release.id ? { borderColor: "var(--accent)", background: "var(--accent-soft)" } : undefined}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{release.releaseTitle}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{release.artistName} / {release.releaseType.toUpperCase()} / {release.releaseDate}</p>
                    </div>
                    <StatusPill label={release.status.replace(/_/g, " ")} active />
                  </div>
                </button>
              ))}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Detailed view" description="Approve, reject, or push a release through review states.">
            {selectedRelease ? (
              <div className="grid gap-5">
                <div className="grid gap-4 lg:grid-cols-[0.9fr,1.1fr]">
                  <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                    {selectedRelease.artworkUrl ? <img src={selectedRelease.artworkUrl} alt={selectedRelease.releaseTitle} className="aspect-square w-full rounded-[1.1rem] object-cover" /> : <div className="aspect-square w-full rounded-[1.1rem] border border-dashed" style={{ borderColor: "var(--border)" }} />}
                  </div>
                  <div className="grid gap-3 text-sm">
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Artist</span><p className="mt-2 font-semibold" style={{ color: "var(--text)" }}>{selectedRelease.artistName}</p></div>
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Release</span><p className="mt-2 font-semibold" style={{ color: "var(--text)" }}>{selectedRelease.releaseTitle}</p></div>
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Metadata</span><p className="mt-2" style={{ color: "var(--text)" }}>{selectedRelease.primaryGenre ?? "-"} / {selectedRelease.secondaryGenre ?? "-"} / {selectedRelease.language}</p></div>
                    <div className="surface-list-item p-4"><span style={{ color: "var(--text-soft)" }}>Queue</span><p className="mt-2" style={{ color: "var(--text)" }}>#{selectedRelease.queuePosition ?? 0} Â· {selectedRelease.estimatedReviewTime ?? "Pending"}</p></div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(["submitted", "in_queue", "under_review", "changes_requested", "approved", "queued_for_distribution", "sent_to_distributor", "processing", "delivered", "rejected", "failed", "live"] as Release["status"][]).map((status) => (
                    <button key={status} type="button" disabled={isPending} onClick={() => updateReleaseStatus(selectedRelease.id, status)} className="btn-outline pressable">
                      {status.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
                <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>Distribution</p>
                      <h3 className="mt-2 text-xl font-semibold" style={{ color: "var(--text)" }}>Distributor API status</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-outline pressable" onClick={() => loadDistributionDetails(selectedRelease.id)}>Refresh logs</button>
                      <button type="button" className="btn-primary pressable" disabled={isPending} onClick={() => retryDistribution(selectedRelease.id)}>Retry</button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <DetailRow label="Current status" value={selectedRelease.status.replace(/_/g, " ")} />
                    <DetailRow label="UPC" value={selectedRelease.upcCode} />
                    <DetailRow label="Distributor ID" value={selectedRelease.distributorReleaseId} />
                    <DetailRow label="Submission date" value={selectedRelease.submittedAt ?? selectedRelease.distributedAt} />
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="surface-list-item p-4">
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Distribution logs</p>
                      <div className="mt-3 grid gap-2">
                        {(selectedDistributionDetails?.logs ?? []).slice(0, 4).map((log) => (
                          <div key={log.id} className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                            <span style={{ color: log.success ? "rgb(34,197,94)" : "rgb(248,113,113)" }}>{log.success ? "Success" : "Failed"}</span>
                            {" / "}
                            {new Date(log.createdAt).toLocaleString()}
                            {log.errors?.length ? <p className="mt-1">{log.errors.join("; ")}</p> : null}
                            {log.warnings?.length ? <p className="mt-1">{log.warnings.join("; ")}</p> : null}
                          </div>
                        ))}
                        {selectedDistributionDetails?.logs?.length ? null : <EmptyState copy="No distribution logs loaded yet." />}
                      </div>
                    </div>
                    <div className="surface-list-item p-4">
                      <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Audit trail</p>
                      <div className="mt-3 grid gap-2">
                        {(selectedDistributionDetails?.audits ?? []).slice(0, 4).map((audit) => (
                          <div key={audit.id} className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                            <span style={{ color: "var(--text)" }}>{audit.action.replace(/_/g, " ")}</span>
                            {" / "}
                            {new Date(audit.createdAt).toLocaleString()}
                          </div>
                        ))}
                        {selectedDistributionDetails?.audits?.length ? null : <EmptyState copy="No audit entries loaded yet." />}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3">
                  {(selectedRelease.tracks ?? []).map((track) => (
                    <article key={track.id} className="surface-list-item p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold" style={{ color: "var(--text)" }}>{track.trackNumber}. {track.trackTitle}</p>
                          <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{track.primaryArtist} / {track.duration}</p>
                        </div>
                        <StatusPill label={track.explicitContent ? "explicit" : "clean"} active={track.explicitContent} />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : <EmptyState copy="Select a release to open the detailed view." />}
          </SurfaceSection>
        </div>
      ) : null}

      {activeTab === "users" ? (
        <SurfaceSection title="Users" description="Review email, release counts, activity, and role assignments.">
          <div className="grid gap-4">
            {users.map((user) => (
              <article key={user.id} className="surface-list-item p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{user.name}</p>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{user.email}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>{releaseCountByUser.get(user.id) ?? 0} releases</span>
                      <span>{latestUserActivity.get(user.id) ? new Date(latestUserActivity.get(user.id) as string).toLocaleDateString() : "No activity yet"}</span>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(["customer", "producer", "admin"] as UserRole[]).map((role) => (
                      <button key={role} type="button" onClick={() => updateRole(user, role)} className={user.role === role ? "btn-primary pressable" : "btn-outline pressable"}>{role}</button>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </SurfaceSection>
      ) : null}

      {(activeTab === "payments" || activeTab === "revenue" || activeTab === "royalties") ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <SurfaceSection title="Distribution payments" description="Track Rs 99 submissions, subscriptions, and payment outcomes.">
            <div className="grid gap-4">
              {initialDistributionOrders.map((order) => {
                const linkedRelease = releases.find((release) => release.id === order.releaseId);
                return (
                  <article key={order.id} className="surface-list-item p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold" style={{ color: "var(--text)" }}>Distribution order #{order.id}</p>
                        <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{order.plan} / {formatMoney(order.amount)}</p>
                      </div>
                      <StatusPill label={order.paymentStatus} active={order.paymentStatus === "paid"} />
                    </div>
                    <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{linkedRelease ? linkedRelease.releaseTitle : "Release not linked yet"}</p>
                  </article>
                );
              })}
              {initialDistributionOrders.length === 0 ? <EmptyState copy="No distribution orders yet." /> : null}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Beat store payments" description="Verified storefront orders and payment state.">
            <div className="grid gap-4">
              {initialOrders.map((order) => (
                <article key={order.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>Order #{order.id}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{order.buyerEmail ?? `User #${order.userId}`}</p>
                    </div>
                    <StatusPill label={order.paymentStatus} active={order.paymentStatus === "paid"} />
                  </div>
                  <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{formatMoney(order.amount)} / {order.razorpayOrderId}</p>
                </article>
              ))}
              {initialOrders.length === 0 ? <EmptyState copy="No beat store orders yet." /> : null}
            </div>
          </SurfaceSection>
        </div>
      ) : null}

      {activeTab === "artists" ? (
        <SurfaceSection title="Artist profiles" description="Every saved artist profile with live store links when available.">
          <div className="grid gap-4 lg:grid-cols-2">
            {initialArtistProfiles.map((profile) => (
              <article key={profile.id} className="surface-list-item flex gap-4 p-4">
                {profile.imageUrl ? <img src={profile.imageUrl} alt={profile.name} className="h-16 w-16 rounded-2xl object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>{profile.name.slice(0, 1)}</div>}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{profile.name}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>User #{profile.userId} Â· {profile.followers ? `${profile.followers.toLocaleString("en-IN")} followers` : "No follower data"}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {profile.spotifyUrl ? <a href={profile.spotifyUrl} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1" style={{ borderColor: "var(--border)", color: "var(--text)" }}>Spotify</a> : null}
                    {profile.appleUrl ? <a href={profile.appleUrl} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1" style={{ borderColor: "var(--border)", color: "var(--text)" }}>Apple Music</a> : null}
                  </div>
                </div>
              </article>
            ))}
            {initialArtistProfiles.length === 0 ? <EmptyState copy="No artist profiles created yet." /> : null}
          </div>
        </SurfaceSection>
      ) : null}

            {(activeTab === "content" || activeTab === "settings") ? (
        <AdminContentManager initialProducerProfiles={initialProducerProfiles} initialSiteSettings={initialSiteSettings} />
      ) : null}

      {activeTab === "timed-playlists" ? (
        <AdminTimedPlaylistManager />
      ) : null}

      {(activeTab === "operations" || activeTab === "producers" || activeTab === "support") ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <SurfaceSection title="Beats" description="Enable or disable storefront inventory.">
            <div className="grid gap-4">
              {beats.map((beat) => (
                <article key={beat.id} className="surface-list-item p-4">
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{beat.title}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>Rs {beat.price} / {beat.genre} / {beat.mood}</p>
                    </div>
                    <button type="button" onClick={() => toggleBeat(beat)} className={beat.enabled ? "btn-outline pressable" : "btn-primary pressable"}>{beat.enabled ? "Disable beat" : "Enable beat"}</button>
                  </div>
                </article>
              ))}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Producer applications" description="Approve or reject producer onboarding.">
            <div className="grid gap-4">
              {applications.map((application) => (
                <article key={application.id} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{application.artistName}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{application.email} / {application.genreFocus}</p>
                  <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{application.message}</p>
                  {application.status === "pending" ? <div className="mt-4 grid gap-2"><button type="button" onClick={() => reviewApplication(application.id, "approved")} className="btn-primary pressable">Approve</button><button type="button" onClick={() => reviewApplication(application.id, "rejected")} className="btn-outline pressable">Reject</button></div> : <div className="mt-4"><StatusPill label={application.status} /></div>}
                </article>
              ))}
              {applications.length === 0 ? <EmptyState copy="No producer applications yet." /> : null}
            </div>
          </SurfaceSection>

          <SurfaceSection title="Partnership leads" description="Inbound business development and partnership requests.">
            <div className="grid gap-4">
              {initialLeads.map((lead) => (
                <article key={lead.id} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{lead.name}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{lead.email} / {lead.collaborationType}</p>
                  <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{lead.message}</p>
                </article>
              ))}
              {initialLeads.length === 0 ? <EmptyState copy="No partnership leads yet." /> : null}
            </div>
          </SurfaceSection>
        </div>
      ) : null}
      {(activeTab === "analytics" || activeTab === "contracts" || activeTab === "promotions" || activeTab === "fraud" || activeTab === "notifications" || activeTab === "team") ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <SurfaceSection title={activeTab === "analytics" ? "Platform analytics" : activeTab === "contracts" ? "Contracts" : activeTab === "promotions" ? "Promotion operations" : activeTab === "fraud" ? "Fraud detection" : activeTab === "notifications" ? "Notifications" : "Team management"} description="Executive module view using live HYMN platform signals while preserving the existing backend operations.">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Total artists" value={users.filter((user) => user.role === "customer").length} />
              <StatCard label="Active releases" value={releases.length} />
              <StatCard label="Monthly revenue" value={formatMoney(distributionRevenue + commerceRevenue)} />
              <StatCard label="Pending reviews" value={pendingReviews} />
            </div>
            <div className="mt-6 grid gap-3">
              {releases.slice(0, 5).map((release) => (
                <article key={`${activeTab}-${release.id}`} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{release.releaseTitle}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{release.artistName} / {release.status.replace(/_/g, " ")}</p>
                    </div>
                    <StatusPill label={release.status.replace(/_/g, " ")} />
                  </div>
                </article>
              ))}
            </div>
          </SurfaceSection>
          <SurfaceSection title="Operational shortcuts" description="Fast paths into the live systems that already power HYMN.">
            <div className="grid gap-3">
              <button type="button" onClick={() => setActiveTab("releases")} className="btn-primary pressable">Open release queue</button>
              <button type="button" onClick={() => setActiveTab("revenue")} className="btn-outline pressable">Review financials</button>
              <button type="button" onClick={() => setActiveTab("producers")} className="btn-outline pressable">Producer operations</button>
            </div>
          </SurfaceSection>
        </div>
      ) : null}
    </DashboardFrame>
  );
}







