"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useMemo, useState, useTransition } from "react";
import { DashboardFrame } from "@/components/dashboard-frame";
import { FloatingAssistant } from "@/components/floating-assistant";
import { BeatCard } from "@/components/beat-card";
import { Beat, BeatPurchase, Notification, Order, Release, SupportTicket, User } from "@/lib/types";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { CustomerHome, ProducerHome } from "@/components/simplified-dashboard-home";

const AnalyticsDashboard = dynamic(() => import("@/components/analytics-dashboard").then((module) => module.AnalyticsDashboard));
const ReferralPanel = dynamic(() => import("@/components/referral-panel").then((module) => module.ReferralPanel));
const SplitsDashboard = dynamic(() => import("@/components/splits-dashboard").then((module) => module.SplitsDashboard));
const ProfilePreferencesForm = dynamic(() => import("@/components/profile-preferences-form").then((module) => module.ProfilePreferencesForm));

type CustomerPayoutSummary = {
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  paidTillDate: number;
  nextPayoutStatus: string;
  monthlyEarnings: Array<{ month: string; netPayable: number }>;
  releaseBreakdown: Array<{ releaseTitle: string; netEarnings: number }>;
  payoutHistory: Array<{ id: number; status: string; requestedAmount: number; requestDate: string }>;
};
type SmartNextAction = { key: string; title: string; reason: string; cta: string; href: string; priority: "critical" | "high" | "normal" };

function SubscriptionActions({ status, cancelAtPeriodEnd }: { status: string; cancelAtPeriodEnd?: boolean }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function run(action: "cancel_period_end" | "pause" | "resume") {
    if (action === "cancel_period_end" && !window.confirm("Stop renewal at the end of the paid billing period?")) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/subscriptions/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Subscription action failed.");
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Subscription action failed."); setPending(false); }
  }
  return <div className="mt-5 flex flex-wrap items-center gap-3">{status === "active" ? <button className="btn-outline" disabled={pending} onClick={() => run("pause")}>Pause billing</button> : null}{status === "paused" ? <button className="btn-outline" disabled={pending} onClick={() => run("resume")}>Resume billing</button> : null}{!["cancelled", "completed", "expired"].includes(status) && !cancelAtPeriodEnd ? <button className="btn-outline" disabled={pending} onClick={() => run("cancel_period_end")}>Cancel renewal</button> : null}{message ? <span className="text-sm text-red-500">{message}</span> : null}</div>;
}

const RELEASE_PIPELINE_STAGES = [
  { key: "draft", label: "Draft", statuses: ["draft"] },
  { key: "payment", label: "Payment", statuses: [] },
  { key: "review", label: "HYMN Review", statuses: ["submitted", "in_queue", "under_review", "resubmitted"] },
  { key: "changes", label: "Changes Required", statuses: ["changes_requested", "rejected"] },
  { key: "distributor", label: "Distributor Processing", statuses: ["approved", "sent", "sent_to_distributor", "delivered", "processing"] },
  { key: "scheduled", label: "Scheduled", statuses: ["scheduled"] },
  { key: "live", label: "Live", statuses: ["live"] }
] as const;

function releaseMatchesPipeline(release: Release, key: string) {
  if (key === "all") return true;
  if (key === "needs_attention") return ["changes_requested", "rejected", "failed"].includes(release.status);
  if (key === "payment") return release.status !== "draft" && release.paymentStatus !== "paid";
  const stage = RELEASE_PIPELINE_STAGES.find((item) => item.key === key);
  return stage ? (stage.statuses as readonly string[]).includes(release.status) : release.status === key;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card customer-stat-card fade-up h-full">
      <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>{value}</p>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card customer-module-section overflow-hidden p-5 sm:p-6 lg:p-7 fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>Artist workspace</p>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl" style={{ color: "var(--text)" }}>{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>{description}</p> : null}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatusPill({ label, active = true }: { label: string; active?: boolean }) {
  const normalized = label.toLowerCase().replace(/_/g, " ");
  const negative = /failed|rejected|denied|missing|issue/.test(normalized);
  const warning = /pending|review|scheduled|requested|processing/.test(normalized);
  return <span className={`status-pill ${active ? "status-pill-active" : ""} ${negative ? "customer-status-negative" : warning ? "customer-status-warning" : ""}`}>{normalized}</span>;
}

function EmptyState({ copy }: { copy: string }) {
  return <div className="rounded-2xl border border-dashed px-5 py-8 text-center text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-soft)" }}>{copy}</div>;
}

function formatMoney(amount: number) {
  return `Rs ${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString();
}

function releaseTitle(release: Release) {
  return release.releaseTitle?.trim() || release.trackName || "Untitled release";
}

function matchesQuery(values: Array<string | number | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
}

function MiniTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)" }}>{children}</div>;
}

function Timeline({ items }: { items: Array<{ label: string; detail?: string; active?: boolean }> }) {
  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex gap-3">
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: item.active ? "var(--accent)" : "var(--border)", background: item.active ? "var(--accent)" : "var(--bg-soft)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.active ? "var(--accent-foreground)" : "var(--text-soft)" }} />
          </span>
          <span>
            <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>{item.label}</span>
            {item.detail ? <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{item.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CustomerDashboardShell({ user, releases, orders, subscription, analytics = [], producerAccessDisabled = false }: { user: User; releases: Release[]; orders: Order[]; subscription?: any | null; analytics?: any[]; producerAccessDisabled?: boolean }) {
  const [activeTab, setActiveTab] = useState<"overview" | "releases" | "upload" | "analytics" | "earnings" | "promotions" | "collaborators" | "distribution" | "content-id" | "messages" | "support" | "settings" | "purchases" | "subscription" | "referral" | "account">("overview");
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [releaseStatusFilter, setReleaseStatusFilter] = useState("all");
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [beatPurchases, setBeatPurchases] = useState<BeatPurchase[]>([]);
  const [smartActions, setSmartActions] = useState<SmartNextAction[]>([]);
  const [payoutSummary, setPayoutSummary] = useState<CustomerPayoutSummary | null>(null);
  const [workspaceAnalytics, setWorkspaceAnalytics] = useState<any[]>(analytics);
  const [supportFeedback, setSupportFeedback] = useState<string | null>(null);
  const paidOrders = orders.filter((order) => order.paymentStatus === "paid");
  const releaseLimit = subscription?.releaseLimit ?? subscription?.release_limit ?? null;
  const subscriptionExpiry = subscription?.expiryDate ?? subscription?.expiry ?? null;
  const releasesNeedingAttention = releases.filter((release) => ["changes_requested", "rejected", "failed"].includes(release.status)).length;
  const planDaysRemaining = subscriptionExpiry ? Math.max(0, Math.ceil((new Date(subscriptionExpiry).getTime() - Date.now()) / 86_400_000)) : 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("module") === "splits") setActiveTab("collaborators");
    else {
      const requested = params.get("tab");
      if (requested && ["overview", "releases", "upload", "analytics", "earnings", "promotions", "collaborators", "distribution", "content-id", "messages", "support", "settings", "purchases", "subscription", "referral", "account"].includes(requested)) setActiveTab(requested as typeof activeTab);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadWorkspaceData() {
      const [notificationResponse, ticketResponse, payoutResponse] = await Promise.all([
        fetch("/api/notifications?limit=30", { cache: "no-store" }).catch(() => null),
        fetch("/api/support-tickets", { cache: "no-store" }).catch(() => null),
        fetch("/api/payout/summary", { cache: "no-store" }).catch(() => null)
      ]);
      if (ignore) return;
      if (notificationResponse?.ok) {
        const data = await notificationResponse.json();
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      }
      if (ticketResponse?.ok) {
        const data = await ticketResponse.json();
        setSupportTickets(Array.isArray(data.tickets) ? data.tickets : []);
      }
      if (payoutResponse?.ok) {
        const data = await payoutResponse.json();
        setPayoutSummary(data);
      }
    }
    loadWorkspaceData();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "purchases" && activeTab !== "support") return;
    let ignore = false;
    fetch("/api/beat-purchases", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!ignore && data) setBeatPurchases(Array.isArray(data.purchases) ? data.purchases : []); })
      .catch(() => undefined);
    return () => { ignore = true; };
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "analytics" || workspaceAnalytics.length) return;
    let ignore = false;
    fetch("/api/dashboard/analytics", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (!ignore && data) setWorkspaceAnalytics(Array.isArray(data.analytics) ? data.analytics : []); })
      .catch(() => undefined);
    return () => { ignore = true; };
  }, [activeTab, workspaceAnalytics.length]);

  async function openNotification(notification: Notification) {
    if (!notification.readAt) {
      const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark-read", notificationId: notification.id }) });
      if (response.ok) setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    }
    if (notification.href) window.location.assign(notification.href);
  }

  async function generatePurchaseLicense(purchaseId: number) {
    const response = await fetch("/api/licenses/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purchaseId }) });
    const data = await response.json();
    if (!response.ok) { setSupportFeedback(data.error || "Could not generate license."); return; }
    setBeatPurchases((items) => items.map((item) => item.id === purchaseId ? { ...item, licenseUrl: data.licenseUrl } : item));
  }

  async function startReleaseFromPurchase(purchaseId: number) {
    const response = await fetch(`/api/beat-purchases/${purchaseId}/start-release`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) { setSupportFeedback(data.error || "Could not start release."); return; }
    window.location.assign(data.href);
  }

  const filteredReleases = useMemo(() => {
    return releases.filter((release) => {
      const matchesStatus = releaseMatchesPipeline(release, releaseStatusFilter);
      return matchesStatus && matchesQuery([releaseTitle(release), release.artistName, release.releaseType, release.status, release.primaryGenre, release.secondaryGenre], dashboardSearch);
    });
  }, [dashboardSearch, releaseStatusFilter, releases]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => matchesQuery([order.id, order.razorpayOrderId, order.paymentStatus, ...order.items.flatMap((item) => [item.beatTitle, item.licenseType, item.producerName])], dashboardSearch));
  }, [dashboardSearch, orders]);

  const actionItems = useMemo(() => {
    const releaseActions = releases
      .filter((release) => ["changes_requested", "rejected", "failed"].includes(release.status))
      .map((release) => ({
        title: release.status === "changes_requested" ? "Release needs correction" : "Release needs attention",
        detail: `${releaseTitle(release)} / ${release.status.replace(/_/g, " ")}`,
        severity: "High",
        time: release.createdAt,
        cta: "Fix release",
        tab: "releases" as typeof activeTab
      }));
    const notificationActions = notifications
      .filter((notification) => !notification.readAt && ["high", "normal"].includes(notification.priority))
      .slice(0, 4)
      .map((notification) => ({
        title: notification.title,
        detail: notification.body,
        severity: notification.priority === "high" ? "High" : "Update",
        time: notification.createdAt,
        cta: "Read",
        tab: "messages" as typeof activeTab
      }));
    return [...releaseActions, ...notificationActions]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 6);
  }, [notifications, releases]);

  function selectCustomerTab(tab: typeof activeTab) {
    setActiveTab(tab);
    setDashboardSearch("");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.toString());
    }
  }

  async function switchProducerAccount() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/login?role=producer&next=/producer/dashboard");
  }

  async function submitSupportTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSupportFeedback(null);
    const response = await fetch("/api/support-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: formData.get("subject"), category: formData.get("category"), priority: formData.get("priority"), relatedReleaseId: formData.get("relatedReleaseId") || null, relatedPurchaseId: formData.get("relatedPurchaseId") || null, relatedPayoutId: formData.get("relatedPayoutId") || null, message: formData.get("message") })
    });
    const data = await response.json();
    if (!response.ok) {
      setSupportFeedback(data.error || "Could not create ticket.");
      return;
    }
    setSupportTickets((items) => [data.ticket, ...items]);
    setSupportFeedback("Support ticket created.");
    form.reset();
  }

  return (
    <DashboardFrame
      title={`Welcome back, ${user.name}`}
      subtitle={user.email}
      overviewSubtitle={actionItems.length > 0 ? <button type="button" className="text-left font-medium transition-opacity hover:opacity-70" style={{ color: "var(--accent)" }} onClick={() => selectCustomerTab(actionItems[0].tab)}>{actionItems.length} item{actionItems.length === 1 ? "" : "s"} need your attention <span aria-hidden="true">→</span></button> : <span>Your workspace is clear.</span>}
      navItems={[
        { key: "overview", label: "Overview", description: "What matters now", group: "Home" },
        { key: "releases", label: "Releases", description: "Your music and status", group: "Music" },
        { key: "upload", label: "New Release", description: "Upload and submit music", group: "Music" },
        { key: "beat-store", label: "Beat Store", description: "Find your next sound", group: "Music", href: "/beat-store" },
        { key: "earnings", label: "Earnings", description: "Reported royalties", group: "Money" },
        { key: "collaborators", label: "Splits", description: "Invites and shares", group: "Money" },
        { key: "payouts", label: "Payouts", description: "Balance and requests", group: "Money", href: "/payout" },
        { key: "profile", label: "Artist Profiles", description: "Your store identities", group: "Account", href: "/dashboard?tab=settings" },
        { key: "referral", label: "Referrals", description: "Invites and HYMN credit", group: "Account" },
        { key: "settings", label: "Settings", description: "Profile and security", group: "Account" },
        { key: "support", label: "Help & FAQ", description: "Guidance and support", group: "Support" }
      ]}
      activeKey={activeTab}
      onSelect={selectCustomerTab}
      onNotificationsClick={() => selectCustomerTab("messages")}
      notificationCount={notifications.filter((notification) => !notification.readAt).length}
      compactOverview
      searchValue={dashboardSearch}
      onSearchChange={setDashboardSearch}
      searchPlaceholder={activeTab === "releases" ? "Search releases, artists, status..." : activeTab === "purchases" ? "Search orders, beats, licenses..." : activeTab === "messages" ? "Search notifications..." : "Search releases, orders, tickets..."}
      quickActions={
        <>
          <Link href="/distribution/start" className="btn-primary pressable px-4 py-2 text-sm">Create Release</Link>
          <button type="button" onClick={() => selectCustomerTab("earnings")} className="btn-outline pressable px-4 py-2 text-sm">Open Payout</button>
          <Link href="/beat-store" className="btn-outline pressable px-4 py-2 text-sm">Buy Beats</Link>
        </>
      }
      workspaceAction={user.role === "producer" ? <WorkspaceSwitcher current="customer" /> : undefined}
    >
      {producerAccessDisabled ? (
        <section role="alert" className="flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "color-mix(in srgb, var(--danger) 45%, var(--border))", background: "color-mix(in srgb, var(--danger-soft) 72%, var(--card))" }}>
          <div>
            <p className="font-semibold" style={{ color: "var(--text)" }}>This signed-in account does not have Producer access.</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Currently signed in as {user.email}. Sign in with the exact Google account that was granted the Producer role.</p>
          </div>
          <button type="button" onClick={switchProducerAccount} className="btn-primary pressable shrink-0">Switch Google account</button>
        </section>
      ) : null}
      {activeTab === "overview" ? <CustomerHome user={user} releases={releases} attention={actionItems.map(item => ({ title: item.title, detail: item.detail, cta: item.cta, href: `/dashboard?tab=${item.tab}` }))} earnings={payoutSummary} notifications={notifications} tickets={supportTickets} onEarnings={() => selectCustomerTab("earnings")} workspaceSummary={{ releaseCount: releases.length, needsAttention: releasesNeedingAttention, plan: subscription ? String(subscription.plan).replace(/_/g, " ") : "No active plan", planDaysRemaining: subscription ? planDaysRemaining : null, credit: Number(user.referralCredits || 0) }} /> : null}
      {false && activeTab === "overview" ? (
        <div className="grid gap-6">
          <Panel title="Action centre" description="Items backed by your account, releases and HYMN notifications that need a decision or correction.">
            <div className="grid gap-4">
              {smartActions.map((item) => <article key={item.key} className="surface-list-item p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><StatusPill label={item.priority} active={item.priority === "critical" || item.priority === "high"} /><p className="mt-3 font-semibold" style={{ color: "var(--text)" }}>{item.title}</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{item.reason}</p></div><a href={item.href} className="btn-outline pressable px-3 py-2 text-xs">{item.cta}</a></div></article>)}
              {smartActions.length === 0 ? actionItems.map((item, index) => (
                <article key={`${item.title}-${index}`} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <StatusPill label={item.severity} active={item.severity === "High"} />
                      <p className="mt-3 font-semibold" style={{ color: "var(--text)" }}>{item.title}</p>
                      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{item.detail}</p>
                    </div>
                    <button type="button" onClick={() => selectCustomerTab(item.tab)} className="btn-outline pressable px-3 py-2 text-xs">{item.cta}</button>
                  </div>
                </article>
              )) : null}
              {smartActions.length === 0 && actionItems.length === 0 ? <EmptyState copy="Nothing needs your attention right now. New corrections, payment issues, split invitations and information requests will appear here." /> : null}
            </div>
          </Panel>

          <Panel title="Release pipeline" description="Real release counts by current operational stage. Select a stage to open the matching catalogue filter.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {RELEASE_PIPELINE_STAGES.map((stage) => { const count = releases.filter((release) => releaseMatchesPipeline(release, stage.key)).length; return <button type="button" key={stage.key} className="surface-list-item min-h-28 p-4 text-left transition hover:border-[var(--border-strong)]" onClick={() => { setReleaseStatusFilter(stage.key); selectCustomerTab("releases"); }}><span className="text-3xl font-semibold" style={{ color: "var(--text)" }}>{count}</span><span className="mt-2 block text-sm" style={{ color: "var(--text-muted)" }}>{stage.label}</span></button>; })}
            </div>
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
            <Panel title="Verified money" description="Balances derived from imported royalty lines and recorded payout activity.">
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label="Available balance" value={formatMoney(payoutSummary?.availableBalance ?? 0)} />
                <StatCard label="Held / pending payout" value={formatMoney(payoutSummary?.pendingBalance ?? 0)} />
                <StatCard label="Lifetime verified earnings" value={formatMoney(payoutSummary?.totalEarnings ?? 0)} />
                <StatCard label="Lifetime paid" value={formatMoney(payoutSummary?.paidTillDate ?? 0)} />
              </div>
              <p className="mt-4 text-xs" style={{ color: "var(--text-soft)" }}>Verified through the latest imported provider statement. Reporting is historical, not real-time.</p>
              <Link href="/payout" className="btn-outline pressable mt-5 inline-flex">Open Payouts</Link>
            </Panel>

            <Panel title="Recent releases" description="Your latest catalogue records and their immediate operational state.">
              <div className="grid gap-3">
                {releases.slice(0, 5).map((release) => <article key={release.id} className="surface-list-item flex flex-wrap items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="truncate font-semibold" style={{ color: "var(--text)" }}>{releaseTitle(release)}</p><p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{release.artistName} · {formatDate(release.releaseDate)}</p><div className="mt-2"><StatusPill label={release.status} active /></div></div><Link href={`/dashboard/releases/${release.id}`} className="btn-outline pressable px-3 py-2 text-xs">View release</Link></article>)}
                {releases.length === 0 ? <EmptyState copy="No releases yet. Create a release to begin your catalogue and delivery workflow." /> : null}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {activeTab === "overview" ? <section className="sr-only" aria-label="Account summary">
        <p>Plan {subscription ? subscription.plan : "none"}; {releases.length} releases; {paidOrders.length} paid purchases; {user.referralCredits} referral credits.</p>
      </section> : null}

      {activeTab === "referral" ? <ReferralPanel /> : null}

      {activeTab === "subscription" ? <Panel title="Subscription" description="Review your active plan, release allowance, and renewal status.">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="summary-card"><span>Current plan</span><span className="capitalize">{subscription?.plan ?? "No active subscription"}</span></div>
          <div className="summary-card"><span>Status</span><span className="capitalize">{subscription?.cancelAtPeriodEnd ? "Cancelled · access until period end" : subscription?.status ?? "Not subscribed"}</span></div>
          <div className="summary-card"><span>{subscription?.autoRenewal ? "Renews on" : "Access until"}</span><span>{subscription ? formatDate(subscription?.nextRenewalDate || subscription?.currentPeriodEnd || subscriptionExpiry) : "Not applicable"}</span></div>
          <div className="summary-card"><span>Price and frequency</span><span>{subscription?.amount != null ? `${subscription.currency || "INR"} ${subscription.amount} · ${subscription.billingInterval || "Provider billing cycle"}` : "Legacy/manual entitlement"}</span></div>
          <div className="summary-card"><span>Started</span><span>{subscription?.startedAt || subscription?.purchasedAt ? formatDate(subscription.startedAt || subscription.purchasedAt) : "Not available"}</span></div>
          <div className="summary-card"><span>Releases used</span><span>{subscription ? `${subscription.releasesUsed ?? 0} / ${releaseLimit ?? "Unlimited"}` : "No plan allowance"}</span></div>
        </div>
        {subscription?.razorpaySubscriptionId ? <SubscriptionActions status={subscription.status} cancelAtPeriodEnd={subscription.cancelAtPeriodEnd} /> : null}
        {subscription?.billingHistory?.length ? <div className="mt-6"><h3 className="font-semibold">Billing history</h3><div className="mt-3 grid gap-2">{subscription.billingHistory.map((payment: any) => <div key={payment.id} className="summary-card"><span>{formatDate(payment.createdAt)} · {payment.status}</span><span>{payment.currency} {payment.amount}{payment.invoiceId ? ` · Invoice ${payment.invoiceId}` : ""}</span></div>)}</div></div> : null}
        <Link href="/distribution#distribution-pricing" className="btn-primary pressable mt-5 inline-flex">View plans</Link>
      </Panel> : null}

      {activeTab === "releases" ? (
        <Panel title="Release command center" description="Search, filter, and inspect every submitted or drafted release.">
          <div className="mb-5 flex flex-wrap gap-2">
            {["all", "draft", "submitted", "in_queue", "under_review", "approved", "sent", "live", "rejected", "failed"].map((status) => (
              <button key={status} type="button" onClick={() => setReleaseStatusFilter(status)} className={releaseStatusFilter === status ? "btn-primary pressable px-3 py-2 text-xs" : "btn-outline pressable px-3 py-2 text-xs"}>
                {status.replace(/_/g, " ")}
              </button>
            ))}
          </div>
          <MiniTable>
            <div className="hidden grid-cols-[1.4fr,0.8fr,0.7fr,0.7fr,0.6fr] gap-3 border-b px-4 py-3 text-xs uppercase tracking-[0.18em] md:grid" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>
              <span>Release</span><span>Type</span><span>Status</span><span>Payment</span><span>Action</span>
            </div>
            <div className="grid gap-0">
              {filteredReleases.map((release) => (
                <article key={release.id} className="grid gap-3 border-b px-4 py-4 md:grid-cols-[1.4fr,0.8fr,0.7fr,0.7fr,0.6fr] md:items-center" style={{ borderColor: "var(--border)" }}>
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{releaseTitle(release)}</p>
                    <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{release.artistName} / {formatDate(release.releaseDate)}</p>
                    {release.status === "draft" ? <p className="mt-1 text-xs" style={{ color: "var(--accent)" }}>{release.draftCompletionPercent ?? 0}% complete{release.missingFields?.length ? ` · Missing: ${release.missingFields.join(", ")}` : ""}</p> : null}
                  </div>
                  <span className="text-sm uppercase" style={{ color: "var(--text-muted)" }}>{release.releaseType}</span>
                  <StatusPill label={release.status.replace(/_/g, " ")} active={!["rejected", "failed"].includes(release.status)} />
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>{release.paymentStatus ?? "pending"}</span>
                  {release.status === "draft" ? <Link href={`/distribution/start?edit=${release.id}`} className="btn-primary pressable px-3 py-2 text-center text-sm">Continue</Link> : <button type="button" onClick={() => setSelectedRelease(release)} className="btn-outline pressable px-3 py-2 text-sm">Details</button>}
                </article>
              ))}
              {filteredReleases.length === 0 ? <div className="p-5"><EmptyState copy="No releases match this search/filter." /></div> : null}
            </div>
          </MiniTable>
        </Panel>
      ) : null}

      {activeTab === "upload" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr,0.9fr]">
          <Panel title="Upload readiness" description="Prepare the essentials before opening the dedicated distribution form.">
            <div className="grid gap-3">
              {[
                ["Primary artist", releases[0]?.artistName || user.name],
                ["Subscription", subscription ? `${subscription.plan} active until ${formatDate(subscriptionExpiry)}` : "No active subscription"],
                ["Release capacity", releaseLimit ? `${subscription?.releasesUsed ?? 0} / ${releaseLimit} used` : "Pay-per-release or unlimited"],
                ["Required assets", "Audio, 3000 x 3000 artwork, contributors, legal confirmations"]
              ].map(([label, value]) => (
                <div key={label} className="summary-card"><span style={{ color: "var(--text-muted)" }}>{label}</span><span className="text-right" style={{ color: "var(--text)" }}>{value}</span></div>
              ))}
            </div>
            <Link href="/distribution/start" className="btn-primary pressable mt-5 inline-flex">Start distribution upload</Link>
          </Panel>
          <Panel title="Pre-flight checklist" description="These are real blockers in the current release form.">
            <Timeline items={[
              { label: "Confirm artist profile/card", detail: "Use saved artist profiles where available.", active: true },
              { label: "Prepare WAV/MP3 audio", detail: "Every track needs a valid audio upload.", active: true },
              { label: "Prepare cover artwork", detail: "Square JPG/PNG, minimum 3000 x 3000.", active: true },
              { label: "Collect contributor legal names", detail: "Songwriters, composers, and producers are required.", active: true }
            ]} />
          </Panel>
        </div>
      ) : null}

      {activeTab === "distribution" ? (
        <Panel title="Distribution pipeline" description="Current delivery stage for every release in review or distribution.">
          <div className="grid gap-4">
            {filteredReleases.map((release) => {
              const status = release.status;
              return (
                <article key={`distribution-${release.id}`} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold" style={{ color: "var(--text)" }}>{releaseTitle(release)}</p>
                      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{release.artistName} / Plan: {release.distributionPlan ?? "one_time"}</p>
                    </div>
                    <StatusPill label={status.replace(/_/g, " ")} active={!["rejected", "failed"].includes(status)} />
                  </div>
                  <div className="mt-4">
                    <Timeline items={[
                      { label: "Draft submitted", active: !["draft"].includes(status) },
                      { label: "Quality check", active: ["in_queue", "under_review", "changes_requested", "approved", "sent", "sent_to_distributor", "processing", "delivered", "live", "rejected", "failed"].includes(status) },
                      { label: "Awaiting approval", active: ["under_review", "changes_requested", "approved", "sent", "sent_to_distributor", "processing", "delivered", "live", "rejected", "failed"].includes(status) },
                      { label: "Sent to distributor", active: ["sent", "sent_to_distributor", "processing", "delivered", "live"].includes(status) },
                      { label: "Delivered/live", active: ["delivered", "live"].includes(status), detail: ["rejected", "failed"].includes(status) ? "Needs correction before delivery can continue." : undefined }
                    ]} />
                  </div>
                </article>
              );
            })}
            {filteredReleases.length === 0 ? <EmptyState copy="No releases are currently in the distribution pipeline." /> : null}
          </div>
        </Panel>
      ) : null}
      {activeTab === "analytics" ? (
        <AnalyticsDashboard userName={user.name} analytics={workspaceAnalytics} />
      ) : null}

      {activeTab === "earnings" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr,0.9fr]">
          <Panel title="Payout dashboard summary" description="Uses verified royalty entries and payout requests. No calculator estimates are treated as balance.">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Total earnings" value={formatMoney(payoutSummary?.totalEarnings ?? 0)} />
              <StatCard label="Available balance" value={formatMoney(payoutSummary?.availableBalance ?? 0)} />
              <StatCard label="Pending payout" value={formatMoney(payoutSummary?.pendingBalance ?? 0)} />
            </div>
            <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <p className="font-semibold" style={{ color: "var(--text)" }}>Payout status</p>
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                {payoutSummary ? payoutSummary.nextPayoutStatus : "Earnings appear after verified royalty reports are processed."} Earnings usually take around 1.5 months to reflect. Withdrawals take 24-48 hours after approval.
              </p>
              <Link href="/payout" className="btn-primary pressable mt-4 inline-flex">Open Payout Dashboard</Link>
            </div>
          </Panel>
          <Panel title="Release-wise earnings">
            <div className="grid gap-3">
              {(payoutSummary?.releaseBreakdown ?? []).map((release) => <div key={release.releaseTitle} className="summary-card"><span>{release.releaseTitle}</span><span>{formatMoney(release.netEarnings)}</span></div>)}
              {!(payoutSummary?.releaseBreakdown ?? []).length ? <EmptyState copy="Earnings appear after verified royalty reports are processed." /> : null}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "promotions" ? (
        <Panel title="Promotion request center" description="Submit real campaign requests into HYMN support instead of a dead campaign card.">
          <form onSubmit={submitSupportTicket} className="grid gap-4 lg:grid-cols-[0.8fr,1.2fr]">
            <select name="subject" className="field" defaultValue="Playlisting campaign request">
              <option>Playlisting campaign request</option>
              <option>Meta ads campaign request</option>
              <option>Release campaign request</option>
              <option>Influencer/reel campaign request</option>
              <option>YouTube/short-form push request</option>
            </select>
            <textarea name="message" required minLength={10} className="field min-h-28" placeholder="Tell HYMN which release, target audience, budget range, and launch date you want help with." />
            <button type="submit" className="btn-primary pressable lg:col-span-2">Submit promotion request</button>
          </form>
          {supportFeedback ? <p className="mt-3 text-sm" style={{ color: "var(--text)" }}>{supportFeedback}</p> : null}
        </Panel>
      ) : null}

      {activeTab === "collaborators" ? (
        <Panel title="Splits and collaborators" description="Create royalty splits, invite collaborators, accept requests, and track verified split earnings.">
          <SplitsDashboard releases={releases} />
        </Panel>
      ) : null}

      {activeTab === "content-id" ? (
        <Panel title="Content ID and monetisation" description="Shows actual release-level Content ID and monetisation consent fields.">
          <div className="grid gap-4">
            {releases.filter((release) => matchesQuery([releaseTitle(release), release.artistName, release.youtubeContentIdChannelUrl], dashboardSearch)).map((release) => (
              <article key={`cid-${release.id}`} className="surface-list-item p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{releaseTitle(release)}</p>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Channel: {release.youtubeContentIdChannelUrl || "Not provided"}</p>
                  </div>
                  <StatusPill label={release.youtubeContentIdEnabled ? "Content ID on" : "Content ID off"} active={Boolean(release.youtubeContentIdEnabled)} />
                </div>
                {!release.youtubeContentIdChannelUrl && release.youtubeContentIdEnabled ? <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>Channel URL is missing for a Content ID-enabled release.</p> : null}
              </article>
            ))}
            {releases.length === 0 ? <EmptyState copy="No releases available for Content ID review." /> : null}
          </div>
        </Panel>
      ) : null}

      {activeTab === "messages" ? (
        <Panel title="Messages and notifications" description="Release updates, payment updates, support responses, and admin notices.">
          {notifications.some((notification) => !notification.readAt) ? <button type="button" className="btn-outline pressable mb-4 px-3 py-2 text-xs" onClick={async () => { const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark-all-read" }) }); if (response.ok) setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))); }}>Mark all as read</button> : null}
          <div className="grid gap-3">
            {notifications.filter((notification) => matchesQuery([notification.title, notification.body, notification.type], dashboardSearch)).map((notification) => (
              <article key={notification.id} className="surface-list-item p-4" style={!notification.readAt ? { borderColor: "var(--accent)" } : undefined}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{notification.title}</p>
                    <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{notification.body}</p>
                  </div>
                  <StatusPill label={notification.readAt ? "read" : "unread"} active={!notification.readAt} />
                </div>
                {notification.href ? <button type="button" onClick={() => openNotification(notification)} className="btn-outline pressable mt-3 px-3 py-2 text-xs">{notification.actionLabel || "Open"}</button> : null}
              </article>
            ))}
            {notifications.length === 0 ? <EmptyState copy="No notifications yet." /> : null}
          </div>
        </Panel>
      ) : null}

      {activeTab === "support" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
          <Panel title="Create support ticket" description="For release, payment, artist profile, beat license, or general issues.">
            <form onSubmit={submitSupportTicket} className="grid gap-4">
              <select name="category" className="field" defaultValue="release_correction">
                <option value="release_correction">Release rejected / corrections</option><option value="payment">Payment failed</option><option value="payout">Payout not visible</option><option value="beat_license">Beat license missing</option><option value="account_access">Google login / account</option><option value="general">General support</option>
              </select>
              <input name="subject" className="field" required minLength={3} placeholder="Short issue summary" />
              <select name="priority" className="field" defaultValue="normal"><option value="normal">Normal priority</option><option value="high">Urgent / blocking</option></select>
              <select name="relatedReleaseId" className="field" defaultValue=""><option value="">No linked release</option>{releases.map((release) => <option key={release.id} value={release.id}>{releaseTitle(release)}</option>)}</select>
              <select name="relatedPurchaseId" className="field" defaultValue=""><option value="">No linked purchase</option>{beatPurchases.map((purchase) => <option key={purchase.id} value={purchase.id}>Purchase #{purchase.id} · Beat #{purchase.beatId}</option>)}</select>
              <select name="relatedPayoutId" className="field" defaultValue=""><option value="">No linked payout</option>{payoutSummary?.payoutHistory.map((payout) => <option key={payout.id} value={payout.id}>Payout #{payout.id} · {payout.status}</option>)}</select>
              <textarea name="message" required minLength={10} className="field min-h-32" placeholder="Describe the issue with release/order IDs if available." />
              <button type="submit" className="btn-primary pressable">Create ticket</button>
              {supportFeedback ? <p className="text-sm" style={{ color: "var(--text)" }}>{supportFeedback}</p> : null}
            </form>
          </Panel>
          <Panel title="Ticket history">
            <div className="grid gap-3">
              {supportTickets.filter((ticket) => matchesQuery([ticket.subject, ticket.message, ticket.status], dashboardSearch)).map((ticket) => (
                <article key={ticket.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-semibold" style={{ color: "var(--text)" }}>{ticket.subject}</p><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{ticket.message}</p></div>
                    <StatusPill label={ticket.status.replace(/_/g, " ")} />
                  </div>
                </article>
              ))}
              {supportTickets.length === 0 ? <EmptyState copy="No support tickets yet." /> : null}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <Panel title="Account settings" description="Profile, subscription, and security state.">
          <ProfilePreferencesForm user={user} />
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="summary-card"><span>Name</span><span>{user.name}</span></div>
            <div className="summary-card"><span>Email</span><span>{user.email}</span></div>
            <div className="summary-card"><span>Role</span><span className="capitalize">{user.role}</span></div>
            <div className="summary-card"><span>Subscription</span><span>{subscription ? `${subscription.plan} / ${formatDate(subscriptionExpiry)}` : "None"}</span></div>
            <div className="summary-card"><span>Password changes</span><span>Unavailable for Google-only accounts</span></div>
          </div>
        </Panel>
      ) : null}

      {activeTab === "purchases" ? (
        <Panel title="Bought beats, downloads, and licenses" description="Review verified orders, payment state, and the assets you unlocked.">
          <div className="grid gap-4">
            {beatPurchases.map((purchase) => <article key={`purchase-${purchase.id}`} className="surface-list-item p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold" style={{ color: "var(--text)" }}>Beat purchase #{purchase.id}</p><p className="mt-1 text-sm capitalize" style={{ color: "var(--text-soft)" }}>Beat #{purchase.beatId} · {purchase.licenseType} · {purchase.licenseUrl ? "License ready" : "License processing"}</p></div><StatusPill label={purchase.releaseId ? "release created" : purchase.licenseUrl ? "ready" : "processing"} active={Boolean(purchase.licenseUrl)} /></div><div className="mt-3 flex flex-wrap gap-2">{purchase.licenseUrl ? <a href={`/api/beat-purchases/${purchase.id}/license`} className="btn-outline pressable px-3 py-2 text-xs">Download License</a> : <button type="button" onClick={() => generatePurchaseLicense(purchase.id)} className="btn-outline pressable px-3 py-2 text-xs">Generate License</button>}<button type="button" disabled={!purchase.licenseUrl} onClick={() => startReleaseFromPurchase(purchase.id)} className="btn-primary pressable px-3 py-2 text-xs disabled:opacity-50">{purchase.releaseId ? "Continue Release" : "Release with this beat"}</button></div></article>)}
            {filteredOrders.map((order) => (
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
                        {order.paymentStatus === "paid" && item.licenseUrl ? <Link href={`/distribution?beatId=${item.beatId}&licenseType=${encodeURIComponent(item.licenseType)}&orderId=${order.id}&licenseUrl=${encodeURIComponent(item.licenseUrl)}`} className="rounded-full bg-[var(--accent)] px-3 py-1 font-semibold text-[var(--accent-contrast)]">Turn this beat into a release</Link> : null}
                      </div>
                      {order.paymentStatus === "paid" && item.licenseUrl ? <p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>HYMN will carry the beat reference and license proof into the distribution flow.</p> : null}
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {filteredOrders.length === 0 ? <EmptyState copy="No purchases match this search." /> : null}
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
              {releases.slice(0, 6).map((release) => (
                <article key={release.id} className="surface-list-item p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{release.releaseTitle || release.trackName}</p>
                    <span className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>
                      {new Date(release.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm capitalize" style={{ color: "var(--text-muted)" }}>Release status: {release.status.replace(/_/g, " ")}</p>
                </article>
              ))}
              {releases.length === 0 ? <EmptyState copy="No release activity yet." /> : null}
            </div>
          </Panel>
        </div>
      ) : null}

      {selectedRelease ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border p-5 shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--card-strong)" }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{releaseTitle(selectedRelease)}</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{selectedRelease.artistName} / {selectedRelease.releaseType}</p>
              </div>
              <button type="button" onClick={() => setSelectedRelease(null)} className="btn-outline pressable">Close</button>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-[0.85fr,1.15fr]">
              <div>
                {selectedRelease.artworkUrl ? <img src={selectedRelease.artworkUrl} alt={releaseTitle(selectedRelease)} className="aspect-square w-full rounded-2xl object-cover" /> : <div className="aspect-square rounded-2xl border border-dashed" style={{ borderColor: "var(--border)" }} />}
                <div className="mt-4 grid gap-2 text-sm">
                  <div className="summary-card"><span>Status</span><span>{selectedRelease.status.replace(/_/g, " ")}</span></div>
                  <div className="summary-card"><span>Payment</span><span>{selectedRelease.paymentStatus ?? "pending"}</span></div>
                  <div className="summary-card"><span>Plan</span><span>{selectedRelease.distributionPlan ?? "one_time"}</span></div>
                  <div className="summary-card"><span>Language</span><span>{selectedRelease.language}</span></div>
                  <div className="summary-card"><span>Mood</span><span>{selectedRelease.mood || "Missing"}</span></div>
                </div>
              </div>
              <div className="grid gap-5">
                <div>
                  <p className="font-semibold" style={{ color: "var(--text)" }}>Tracks</p>
                  <div className="mt-3 grid gap-2">
                    {(selectedRelease.tracks ?? []).map((track) => (
                      <div key={track.id} className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                        {track.trackNumber}. {track.trackTitle} / {track.primaryArtist || selectedRelease.artistName}
                      </div>
                    ))}
                    {!(selectedRelease.tracks ?? []).length ? <EmptyState copy="Track metadata is not expanded for this release." /> : null}
                  </div>
                </div>
                <div>
                  <p className="font-semibold" style={{ color: "var(--text)" }}>Status timeline</p>
                  <div className="mt-3">
                    <Timeline items={[
                      { label: "Created", detail: formatDate(selectedRelease.createdAt), active: true },
                      { label: "Review", detail: selectedRelease.status.replace(/_/g, " "), active: !["draft"].includes(selectedRelease.status) },
                      { label: "Distribution", detail: selectedRelease.distributorReleaseId ? `Distributor ID ${selectedRelease.distributorReleaseId}` : "Not sent yet", active: Boolean(selectedRelease.distributorReleaseId) },
                      { label: "Live", detail: selectedRelease.liveAt ? formatDate(selectedRelease.liveAt) : "Not marked live", active: selectedRelease.status === "live" }
                    ]} />
                  </div>
                </div>
                <div>
                  <p className="font-semibold" style={{ color: "var(--text)" }}>Platforms</p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{selectedRelease.platforms?.join(", ") || "No platform list saved."}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/dashboard/releases" className="btn-outline pressable">Open release portal</Link>
                  <Link href="/faq" className="btn-outline pressable">Contact support about release</Link>
                </div>
              </div>
            </div>
          </div>
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

