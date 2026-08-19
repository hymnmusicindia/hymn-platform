"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { FloatingAssistant } from "@/components/floating-assistant";
import { WorkspaceRoleSwitch } from "@/components/workspace-role-switch";
import { ReferralPanel } from "@/components/referral-panel";
import { Beat, Order, Release, User } from "@/lib/types";

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card fade-up">
      <p className="text-sm" style={{ color: "var(--text-soft)" }}>{label}</p>
      <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
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

function StatusPill({ label, active = true }: { label: string; active?: boolean }) {
  return <span className={active ? "status-pill status-pill-active" : "status-pill"}>{label}</span>;
}

function EmptyState({ copy }: { copy: string }) {
  return <p className="text-sm" style={{ color: "var(--text-soft)" }}>{copy}</p>;
}

export function CustomerDashboardShell({ user, releases, orders }: { user: User; releases: Release[]; orders: Order[] }) {
  const [activeTab, setActiveTab] = useState<"overview" | "releases" | "upload" | "analytics" | "earnings" | "promotions" | "collaborators" | "distribution" | "content-id" | "messages" | "support" | "settings" | "purchases" | "account">("overview");
  const paidOrders = orders.filter((order) => order.paymentStatus === "paid");

  const latestActivity = useMemo(
    () =>
      [
        ...releases.map((release) => ({
          title: release.trackName,
          detail: `Distribution / ${release.status.replace(/_/g, " ")}`,
          createdAt: release.createdAt
        })),
        ...orders.map((order) => ({
          title: `Order #${order.id}`,
          detail: `${order.items.length} license(s) / ${order.paymentStatus}`,
          createdAt: order.createdAt
        }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders, releases]
  );

  return (
    <DashboardFrame
      eyebrow="Customer dashboard"
      title={user.name}
      subtitle={user.email}
      navItems={[
        { key: "overview", label: "Overview", description: "Career command center" },
        { key: "releases", label: "Releases", description: "Catalog and statuses" },
        { key: "upload", label: "Upload Music", description: "Submit new music" },
        { key: "analytics", label: "Analytics", description: "Streams and audience" },
        { key: "earnings", label: "Earnings", description: "Revenue and payouts" },
        { key: "promotions", label: "Promotions", description: "Campaign tools" },
        { key: "collaborators", label: "Collaborators", description: "Credits and splits" },
        { key: "distribution", label: "Distribution", description: "DSP delivery" },
        { key: "content-id", label: "Content ID", description: "Monetization claims" },
        { key: "messages", label: "Messages", description: "HYMN updates" },
        { key: "support", label: "Support", description: "Help and requests" },
        { key: "settings", label: "Settings", description: "Profile and security" }
      ]}
      activeKey={activeTab}
      onSelect={setActiveTab}
    >
      <WorkspaceRoleSwitch currentRole={user.role as Exclude<User["role"], "admin">} />

      {activeTab === "overview" ? (
        <div className="grid gap-6">
          <Panel title="Artist operating system" description="A focused view of your release motion, audience signal, and next best actions.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Link href="/distribution" className="btn-primary pressable">Upload Music</Link>
              <Link href="/dashboard/releases" className="btn-outline pressable">Track Releases</Link>
              <Link href="/services" className="btn-outline pressable">Launch Campaign</Link>
            </div>
            <div className="mt-6 grid gap-4">
              {latestActivity.slice(0, 3).map((item) => (
                <article key={`${item.title}-${item.createdAt}`} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{item.detail}</p>
                </article>
              ))}
              {latestActivity.length === 0 ? <EmptyState copy="No artist activity yet." /> : null}
            </div>
          </Panel>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Releases in system" value={releases.length} />
        <StatCard label="Paid purchases" value={paidOrders.length} />
        <StatCard label="Referral credits" value={`Rs ${user.referralCredits}`} />
      </section>

      <ReferralPanel />

      {activeTab === "overview" ? null : <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <section className="surface-card p-5 sm:p-6">
          <p className="eyebrow mb-3">Quick actions</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/distribution" className="btn-primary pressable">Upload New Track</Link>
            <Link href="/beat-store" className="btn-outline pressable">Browse Beats</Link>
            <Link href="/dashboard/releases" className="btn-outline pressable">My Releases</Link>
          </div>
          <div className="mt-6 rounded-[1.4rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.26em]" style={{ color: "var(--text-soft)" }}>Boost your release</p>
            <h3 className="mt-2 text-2xl font-semibold" style={{ color: "var(--text)" }}>Social Media Marketing, Playlisting, Distribution</h3>
            <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Keep the momentum moving with HYMN services while your release is already in motion.</p>
            <Link href="/services" target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-full border px-5 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--accent)", color: "var(--accent-foreground)" }}>Explore Services</Link>
          </div>
        </section>
      </div>}

      {(activeTab === "distribution" || activeTab === "releases" || activeTab === "upload") ? (
        <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
          <Panel title="Distribution portal" description="Open the dedicated release workspace for a clean, separate submission flow.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/distribution" className="btn-primary pressable">Open release portal</Link>
              <Link href="/faq" className="btn-outline pressable">Read release FAQ</Link>
            </div>
            <div className="mt-6 grid gap-4">
              {releases.slice(0, 4).map((release) => (
                <article key={release.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{release.trackName}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>
                        {release.artistName} / {release.releaseType.toUpperCase()} / {release.releaseDate}
                      </p>
                    </div>
                    <StatusPill label={release.status.replace(/_/g, " ")} />
                  </div>
                </article>
              ))}
              {releases.length === 0 ? <EmptyState copy="No submissions yet." /> : null}
            </div>
          </Panel>
          <Panel title="Submission history" description="Track every release and keep tabs on review progress.">
            <div className="grid gap-4">
              {releases.map((release) => (
                <article key={release.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{release.trackName}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>
                        {release.artistName} / {release.releaseType.toUpperCase()} / {release.releaseDate}
                      </p>
                    </div>
                    <StatusPill label={release.status.replace(/_/g, " ")} />
                  </div>
                </article>
              ))}
              {releases.length === 0 ? <EmptyState copy="No submissions yet." /> : null}
            </div>
          </Panel>
        </div>
      ) : null}

      {(activeTab === "analytics" || activeTab === "earnings" || activeTab === "promotions" || activeTab === "collaborators" || activeTab === "content-id" || activeTab === "messages" || activeTab === "support" || activeTab === "settings") ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title={activeTab === "analytics" ? "Artist analytics" : activeTab === "earnings" ? "Earnings and payouts" : activeTab === "promotions" ? "Promotion tools" : activeTab === "collaborators" ? "Collaborator workspace" : activeTab === "content-id" ? "Content ID control" : activeTab === "messages" ? "Messages" : activeTab === "support" ? "Support center" : "Settings"} description="Premium workspace module connected to your existing release, order, and account data.">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Releases in system" value={releases.length} />
              <StatCard label="Paid purchases" value={paidOrders.length} />
            </div>
            <div className="mt-5 grid gap-3">
              {latestActivity.slice(0, 4).map((item) => (
                <article key={`${activeTab}-${item.title}-${item.createdAt}`} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{item.detail}</p>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Workflow shortcuts" description="Fast actions for the next step in your release cycle.">
            <div className="grid gap-3">
              <Link href="/distribution" className="btn-primary pressable">Open distribution portal</Link>
              <Link href="/services" className="btn-outline pressable">Promote a release</Link>
              <Link href="/faq" className="btn-outline pressable">Read support FAQ</Link>
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "purchases" ? (
        <Panel title="Bought beats, downloads, and licenses" description="Review verified orders, payment state, and the assets you unlocked.">
          <div className="grid gap-4">
            {orders.map((order) => (
              <article key={order.id} className="surface-list-item p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>Order #{order.id}</p>
                  <StatusPill label={order.paymentStatus} active={order.paymentStatus === "paid"} />
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{order.razorpayOrderId}</p>
                <div className="mt-4 grid gap-3">
                  {order.items.map((item, index) => (
                    <div key={`${order.id}-${item.beatId}-${index}`} className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold" style={{ color: "var(--text)" }}>{item.beatTitle ?? `Beat #${item.beatId}`}</p>
                          <p className="capitalize" style={{ color: "var(--text-soft)" }}>{item.licenseType} license</p>
                        </div>
                        <p style={{ color: "var(--text)" }}>Rs {item.price}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-soft)" }}>
                        {item.downloadUrl ? <a href={item.downloadUrl} className="rounded-full border px-3 py-1" style={{ borderColor: "var(--border)" }}>Download file</a> : null}
                        {item.licenseUrl ? <a href={item.licenseUrl} className="rounded-full border px-3 py-1" style={{ borderColor: "var(--border)" }}>View license</a> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {orders.length === 0 ? <EmptyState copy="No purchases yet." /> : null}
          </div>
        </Panel>
      ) : null}
      {activeTab === "account" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
          <Panel title="Account" description="Everything tied to your HYMN identity and referral state.">
            <div className="grid gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
              <p>Name: <span style={{ color: "var(--text)" }}>{user.name}</span></p>
              <p>Email: <span style={{ color: "var(--text)" }}>{user.email}</span></p>
              <p>Role: <span className="capitalize" style={{ color: "var(--text)" }}>{user.role}</span></p>
              <p>Referral code: <span style={{ color: "var(--text)" }}>{user.referralCode}</span></p>
            </div>
          </Panel>
          <Panel title="Activity overview" description="Recent distribution and purchase events in one place.">
            <div className="grid gap-4">
              {latestActivity.slice(0, 6).map((item) => (
                <article key={`${item.title}-${item.createdAt}`} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                    <span className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{item.detail}</p>
                </article>
              ))}
              {latestActivity.length === 0 ? <EmptyState copy="No activity yet." /> : null}
            </div>
          </Panel>
        </div>
      ) : null}
      <FloatingAssistant
        context="Customer support"
        suggestions={[
          { label: "Submit a release", description: "Jump straight into distribution metadata and files." },
          { label: "Browse beats", description: "Open the revenue engine and licensing options." },
          { label: "Check account", description: "Review your profile, referral code, and activity." }
        ]}
      />

    </DashboardFrame>
  );
}

export function ProducerDashboardShell({ user, beats, orders, earnings }: { user: User; beats: Beat[]; orders: Order[]; earnings: { totalSales: number; totalRevenue: number; beatsSold: number } }) {
  const [activeTab, setActiveTab] = useState<"overview" | "catalog" | "collaborations" | "placements" | "contracts" | "earnings" | "upload" | "licensing" | "messages" | "analytics" | "settings" | "manage" | "sales">("overview");
  const [catalog, setCatalog] = useState(beats);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleBeatUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setFeedback(null);

    startTransition(async () => {
      const response = await fetch("/api/producer/beats", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not upload beat.");
        return;
      }
      setCatalog((items) => [data.beat, ...items]);
      setFeedback(`Beat uploaded: ${data.beat.title}`);
      form.reset();
    });
  }

  function handleBeatUpdate(beat: Beat, patch: Partial<Beat>) {
    startTransition(async () => {
      const response = await fetch(`/api/producer/beats/${beat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await response.json();
      if (!response.ok) {
        setFeedback(data.error || "Could not update beat.");
        return;
      }
      setCatalog((items) => items.map((item) => (item.id === beat.id ? data.beat : item)));
      setFeedback(`Beat updated: ${data.beat.title}`);
    });
  }

  return (
    <DashboardFrame
      eyebrow="Producer dashboard"
      title={user.name}
      subtitle={user.email}
      navItems={[
        { key: "overview", label: "Overview", description: "Creative command center" },
        { key: "catalog", label: "Beat Catalog", description: "Inventory and metadata" },
        { key: "collaborations", label: "Collaborations", description: "Artist rooms" },
        { key: "placements", label: "Placements", description: "Tracks and wins" },
        { key: "contracts", label: "Contracts", description: "Splits and signing" },
        { key: "earnings", label: "Earnings", description: "Revenue and payouts" },
        { key: "upload", label: "Uploads", description: "Push new inventory live" },
        { key: "licensing", label: "Licensing", description: "License tiers" },
        { key: "messages", label: "Messages", description: "Requests and inbox" },
        { key: "analytics", label: "Analytics", description: "Beat performance" },
        { key: "settings", label: "Settings", description: "Profile and catalog" }
      ]}
      activeKey={activeTab}
      onSelect={setActiveTab}
    >
      <WorkspaceRoleSwitch currentRole={user.role as Exclude<User["role"], "admin">} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Catalog size" value={catalog.length} />
        <StatCard label="Paid orders" value={earnings.totalSales} />
        <StatCard label="Licenses sold" value={earnings.beatsSold} />
        <StatCard label="Revenue" value={`Rs ${earnings.totalRevenue}`} />
      </section>

      {activeTab === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <Panel title="Creative collaboration workspace" description="Catalog, placements, licensing, and artist requests in one premium producer OS.">
            <div className="grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={() => setActiveTab("upload")} className="btn-primary pressable">Upload Beat</button>
              <button type="button" onClick={() => setActiveTab("catalog")} className="btn-outline pressable">Manage Catalog</button>
              <button type="button" onClick={() => setActiveTab("licensing")} className="btn-outline pressable">Licensing</button>
            </div>
            <div className="mt-6 grid gap-4">
              {catalog.slice(0, 4).map((beat) => (
                <article key={beat.id} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{beat.title}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{beat.genre} / {beat.mood} / {beat.bpm} BPM / Rs {beat.price}</p>
                </article>
              ))}
              {catalog.length === 0 ? <EmptyState copy="No beats uploaded yet." /> : null}
            </div>
          </Panel>
          <Panel title="Producer intelligence" description="Signals from sales, catalog activity, and collaboration momentum.">
            <div className="grid gap-4">
              <StatCard label="Active collaborations" value={Math.max(1, orders.length)} />
              <StatCard label="Placements secured" value={earnings.beatsSold} />
              <StatCard label="Artist requests" value={catalog.filter((beat) => beat.enabled).length} />
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "upload" ? (
        <Panel title="Upload beats" description="Add previews, files, pricing, and optional artwork in a mobile-friendly layout.">
          <form onSubmit={handleBeatUpload} className="grid gap-4 lg:grid-cols-2">
            <input name="title" required className="field" placeholder="Beat title" />
            <input name="bpm" required type="number" min="1" className="field" placeholder="BPM" />
            <input name="genre" required className="field" placeholder="Genre" />
            <input name="mood" required className="field" placeholder="Mood" />
            <input name="price" required type="number" min="1" className="field" placeholder="Price" />
            <div className="lg:col-span-2"><input name="audioPreview" required type="file" accept="audio/*,.wav,.mp3" className="field" /></div>
            <div className="lg:col-span-2"><input name="file" required type="file" accept="audio/*,.wav,.mp3,.zip" className="field" /></div>
            <div className="lg:col-span-2"><input name="artwork" type="file" accept="image/*" className="field" /></div>
            <div className="lg:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm" style={{ color: "var(--text-soft)" }}>Uploads go directly into the producer catalog and storefront database.</p>
              <button type="submit" disabled={isPending} className="btn-primary pressable">{isPending ? "Uploading..." : "Upload beat"}</button>
            </div>
            {feedback ? <p className="lg:col-span-2 text-sm" style={{ color: "var(--text)" }}>{feedback}</p> : null}
          </form>
        </Panel>
      ) : null}
      {(activeTab === "manage" || activeTab === "catalog") ? (
        <Panel title="Manage beats" description="Enable, disable, and price your catalog without desktop-only controls.">
          <div className="grid gap-4">
            {catalog.map((beat) => (
              <article key={beat.id} className="surface-list-item p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{beat.title}</p>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>
                      {beat.genre} / {beat.mood} / {beat.bpm} BPM / Rs {beat.price}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => handleBeatUpdate(beat, { enabled: !beat.enabled })} className="btn-outline pressable">
                      {beat.enabled ? "Disable" : "Enable"}
                    </button>
                    <button type="button" onClick={() => handleBeatUpdate(beat, { price: beat.price + 50 })} className="btn-outline pressable">
                      Raise Price
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {catalog.length === 0 ? <EmptyState copy="No beats uploaded yet." /> : null}
          </div>
        </Panel>
      ) : null}

      {(activeTab === "analytics" || activeTab === "licensing" || activeTab === "contracts" || activeTab === "placements" || activeTab === "collaborations" || activeTab === "messages" || activeTab === "settings") ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Panel title={activeTab === "analytics" ? "Beat analytics" : activeTab === "licensing" ? "Licensing system" : activeTab === "contracts" ? "Contracts and splits" : activeTab === "placements" ? "Placements" : activeTab === "collaborations" ? "Collaboration rooms" : activeTab === "messages" ? "Messages" : "Settings"} description="A premium producer workspace view backed by your existing beat catalog and order data.">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Catalog size" value={catalog.length} />
              <StatCard label="Revenue" value={`Rs ${earnings.totalRevenue}`} />
            </div>
            <div className="mt-5 grid gap-3">
              {catalog.slice(0, 4).map((beat) => (
                <article key={`${activeTab}-${beat.id}`} className="surface-list-item p-4">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{beat.title}</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>{beat.genre} / {beat.bpm} BPM / {beat.enabled ? "Live" : "Disabled"}</p>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Workflow shortcuts" description="Move quickly across catalog, licensing, and collaboration tasks.">
            <div className="grid gap-3">
              <button type="button" onClick={() => setActiveTab("upload")} className="btn-primary pressable">Upload new beat</button>
              <button type="button" onClick={() => setActiveTab("catalog")} className="btn-outline pressable">Review catalog</button>
              <Link href="/beat-store" className="btn-outline pressable">Open storefront</Link>
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "earnings" ? (
        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Total sales" value={earnings.totalSales} />
          <StatCard label="Revenue" value={`Rs ${earnings.totalRevenue}`} />
          <div className="metric-card fade-up">
            <p className="text-sm" style={{ color: "var(--text-soft)" }}>Beat-wise performance</p>
            <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>{earnings.beatsSold}</p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Total licenses sold across your catalog.</p>
          </div>
        </section>
      ) : null}

      {activeTab === "sales" ? (
        <Panel title="Sales history" description="See every verified order and the license mix behind it.">
          <div className="grid gap-4">
            {orders.map((order) => (
              <article key={order.id} className="surface-list-item p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>Order #{order.id}</p>
                  <StatusPill label={`Rs ${order.amount}`} />
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>Buyer: {order.buyerName ?? `User #${order.userId}`}</p>
                <div className="mt-4 grid gap-2">
                  {order.items.map((item, index) => (
                    <div key={`${order.id}-${item.beatId}-${index}`} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                      {item.beatTitle ?? `Beat #${item.beatId}`} / {item.licenseType} / Rs {item.price}
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {orders.length === 0 ? <EmptyState copy="No producer sales yet." /> : null}
          </div>
        </Panel>
      ) : null}
      <FloatingAssistant
        context="Producer support"
        suggestions={[
          { label: "Upload a beat", description: "Jump to the inventory upload workflow." },
          { label: "Check sales", description: "Review orders and catalog performance." },
          { label: "Open beatstore", description: "See the storefront experience like a buyer." }
        ]}
      />

    </DashboardFrame>
  );
}





