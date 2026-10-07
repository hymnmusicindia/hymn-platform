"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AlertCircle, Bell, CheckCircle2, ChevronDown, Disc3, Headphones, HelpCircle, LayoutDashboard, LogOut, Menu, Music2, PackageCheck, ShieldCheck, ShoppingCart, UserRound, WalletCards, X } from "lucide-react";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { mainNav } from "@/lib/site";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SessionPayload } from "@/lib/types";
import { beatLicenseLabel, type BeatStoreLicenseType } from "@/lib/beat-store";
import { SmartHelpToggle } from "@/components/smart-help-toggle";

type SiteHeaderProps = {
  user?: SessionPayload | null;
};

type HeaderNotification = {
  id: number;
  title: string;
  body: string;
  type: "release" | "beat" | "order" | "payout" | "account" | "system";
  href?: string | null;
  actionLabel?: string | null;
  priority: "low" | "normal" | "high";
  readAt?: string | null;
  createdAt: string;
};

type HeaderCartItem = { beatId: number; licenseType: BeatStoreLicenseType | "general" | "basic" | "premium"; price: number };
type HeaderCartBeat = { id: number; title: string; producerName?: string; artworkUrl?: string };
type PresenceStatus = "online" | "invisible" | "do_not_disturb";

const presenceOptions: Array<{ value: PresenceStatus; label: string; description: string }> = [
  { value: "online", label: "Online", description: "Show a green status dot" },
  { value: "invisible", label: "Invisible", description: "Appear offline" },
  { value: "do_not_disturb", label: "Do Not Disturb", description: "Show a red status dot" }
];

function notificationTimeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export function SiteHeader({ user = null }: SiteHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceStatus>("online");
  const [presenceSaving, setPresenceSaving] = useState(false);
  const [presenceExpanded, setPresenceExpanded] = useState(false);
  const [appLauncherOpen, setAppLauncherOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartDropSequence, setCartDropSequence] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartMounted, setCartMounted] = useState(false);
  const [cartItems, setCartItems] = useState<HeaderCartItem[]>([]);
  const [cartBeats, setCartBeats] = useState<HeaderCartBeat[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const notificationMutationsRef = useRef<Set<number>>(new Set());
  const markAllPendingRef = useRef(false);
  const previousCartCountRef = useRef<number | null>(null);
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    setOpen(false);
    setProfileOpen(false);
    setNotificationsOpen(false);
    setAppLauncherOpen(false);
    setCartOpen(false);
  }, [pathname]);

  useEffect(() => {
    setCartMounted(true);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/account/presence", { cache: "no-store" })
      .then(async response => response.ok ? response.json() : Promise.reject())
      .then(data => { if (presenceOptions.some(option => option.value === data.presence)) setPresence(data.presence); })
      .catch(() => undefined);
  }, [isAuthenticated]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onScroll = () => setScrolled(Math.max(0, window.scrollY || document.documentElement.scrollTop) > 18);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (open) {
      setScrolled(true);
    }
  }, [open]);

  useEffect(() => {
    if (!profileOpen) return;

    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-profile-menu-root]")) setProfileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setProfileOpen(false); };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (!appLauncherOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-app-launcher-root]")) setAppLauncherOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setAppLauncherOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [appLauncherOpen]);

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    if (markAllPendingRef.current || notificationMutationsRef.current.size > 0) return;
    setNotificationsLoading(true);
    try {
      const response = await fetch("/api/notifications?limit=20", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount ?? 0));
    } finally {
      setNotificationsLoading(false);
    }
  }, [isAuthenticated]);

  const loadNotificationSummary = useCallback(async () => {
    if (!isAuthenticated || notificationsOpen) return;
    const response = await fetch("/api/notifications?summary=1", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setUnreadCount(Number(data.unreadCount ?? 0));
  }, [isAuthenticated, notificationsOpen]);

  async function markNotificationRead(notificationId: number) {
    if (!isAuthenticated || notificationMutationsRef.current.has(notificationId)) return true;
    const target = notifications.find((item) => item.id === notificationId);
    if (!target || target.readAt) return true;
    notificationMutationsRef.current.add(notificationId);
    const previousUnreadCount = unreadCount;
    const optimisticReadAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => item.id === notificationId ? { ...item, readAt: optimisticReadAt } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-read", notificationId })
      });
      if (!response.ok) throw new Error("Could not mark notification as read.");
      const data = await response.json();
      setUnreadCount(Number(data.unreadCount ?? 0));
      return true;
    } catch {
      setNotifications((items) => items.map((item) => item.id === notificationId ? { ...item, readAt: target.readAt } : item));
      setUnreadCount(previousUnreadCount);
      return false;
    } finally {
      notificationMutationsRef.current.delete(notificationId);
    }
  }

  async function markAllNotificationsRead() {
    if (!isAuthenticated || markAllPendingRef.current || unreadCount === 0) return;
    markAllPendingRef.current = true;
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-all-read" })
      });
      if (!response.ok) throw new Error("Could not mark notifications as read.");
      const data = await response.json();
      setUnreadCount(Number(data.unreadCount ?? 0));
    } catch {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
    } finally {
      markAllPendingRef.current = false;
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setNotificationsOpen(false);
      return;
    }

    // Keep the unread badge current, but avoid waking every authenticated page more
    // often than necessary. Manual opening still refreshes immediately below.
    void loadNotificationSummary();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotificationSummary();
    }, 120_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && notificationsOpen) void loadNotifications();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isAuthenticated, loadNotificationSummary, notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen || !isAuthenticated) return;
    void loadNotifications();
  }, [isAuthenticated, loadNotifications, notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("[data-notification-menu-root]")) setNotificationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setNotificationsOpen(false); };

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readCartCount = () => {
      try {
        const raw = window.localStorage.getItem("hymn-beat-cart");
        if (!raw) {
          previousCartCountRef.current = 0;
          setCartItems([]);
          setCartCount(0);
          return;
        }
        const cart = JSON.parse(raw);
        const items = Array.isArray(cart) ? cart : [];
        const nextCount = items.length;
        if (previousCartCountRef.current !== null && nextCount > previousCartCountRef.current) setCartDropSequence((value) => value + 1);
        previousCartCountRef.current = nextCount;
        setCartItems(items);
        setCartCount(nextCount);
      } catch {
        previousCartCountRef.current = 0;
        setCartItems([]);
        setCartCount(0);
      }
    };

    const onCartUpdated = () => {
      readCartCount();
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "hymn-beat-cart") readCartCount();
    };

    readCartCount();
    window.addEventListener("hymn-cart-updated", onCartUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("hymn-cart-updated", onCartUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const openCart = () => {
    setOpen(false);
    setAppLauncherOpen(false);
    setScrolled(true);
    setCartOpen(true);
  };

  useEffect(() => {
    if (!cartOpen || cartBeats.length) return;
    fetch("/api/beats")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setCartBeats(Array.isArray(data.beats) ? data.beats : []))
      .catch(() => setCartBeats([]));
  }, [cartBeats.length, cartOpen]);

  useEffect(() => {
    if (!cartOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setCartOpen(false); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [cartOpen]);

  function removeCartItem(beatId: number, licenseType: HeaderCartItem["licenseType"]) {
    const next = cartItems.filter((item) => !(item.beatId === beatId && item.licenseType === licenseType));
    setCartItems(next);
    setCartCount(next.length);
    window.localStorage.setItem("hymn-beat-cart", JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("hymn-cart-updated", { detail: { count: next.length, items: next } }));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    setProfileOpen(false);
    setNotificationsOpen(false);
    router.push("/");
    router.refresh();
  }

  async function updatePresence(next: PresenceStatus) {
    setPresenceExpanded(false);
    if (presenceSaving || next === presence) return;
    const previous = presence;
    setPresence(next);
    setPresenceSaving(true);
    try {
      const response = await fetch("/api/account/presence", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ presence: next }) });
      if (!response.ok) throw new Error("Could not update profile status.");
    } catch {
      setPresence(previous);
    } finally {
      setPresenceSaving(false);
    }
  }

  const initials = user?.name
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "HY";
  const fallbackAvatar = `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#f5c16c"/><stop offset="1" stop-color="#7db7ff"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><circle cx="64" cy="52" r="20" fill="#090b10" opacity="0.82"/><path d="M28 112c5.5-24 18.2-36 36-36s30.5 12 36 36" fill="#090b10" opacity="0.82"/><text x="64" y="116" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#ffffff">${initials}</text></svg>`
  )}`;

  const NotificationIcon = ({ type }: { type: HeaderNotification["type"] }) => {
    const className = "h-4 w-4";
    if (type === "release") return <Disc3 className={className} />;
    if (type === "beat") return <PackageCheck className={className} />;
    if (type === "order" || type === "payout") return <WalletCards className={className} />;
    if (type === "account") return <ShieldCheck className={className} />;
    return <Bell className={className} />;
  };

  const NotificationBell = ({ mobile = false }: { mobile?: boolean }) =>
    isAuthenticated ? (
      <div data-notification-menu-root className={clsx("relative z-[1250] pointer-events-auto", mobile ? "w-full" : "")}>
        <button
          type="button"
          onClick={() => { setNotificationsOpen((value) => !value); setProfileOpen(false); setAppLauncherOpen(false); }}
          className={clsx("site-header-bare-icon site-notification-trigger relative inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent sm:h-11 sm:w-11", mobile ? "w-full justify-start gap-3 px-3" : "")}
          style={{ color: "var(--text)" }}
          aria-expanded={notificationsOpen}
          aria-haspopup="dialog"
          aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <span className="relative inline-flex h-5 w-5 shrink-0">
            <Bell aria-hidden="true" className={clsx("notification-bell-icon h-5 w-5", unreadCount > 0 && "has-unread")} />
            {unreadCount > 0 ? <span aria-hidden="true" className="notification-unread-alert">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
          </span>
          {mobile ? <span className="text-sm font-semibold">Notifications</span> : null}
        </button>

        {notificationsOpen ? (
          <div
            role="dialog"
            aria-label="Notifications"
            onMouseDown={(event) => event.stopPropagation()}
            className={clsx("site-notification-panel z-[1260] mt-3 rounded-2xl border p-3 shadow-2xl", mobile ? "w-full" : "absolute right-0 w-[min(26rem,calc(100vw-2rem))]")}
          >
            <div className="site-notification-heading flex items-start justify-between gap-3 border-b pb-3">
              <div>
                <p className="site-notification-eyebrow">Your activity</p>
                <p className="site-notification-title">Notifications</p>
                <p className="site-notification-subtitle">{unreadCount ? `${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}` : "All caught up"}</p>
              </div>
              <button type="button" onClick={markAllNotificationsRead} disabled={unreadCount === 0} className="site-notification-mark-all rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-40">
                Mark all as read
              </button>
            </div>
            <div className="site-notification-list mt-3 grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
              {notificationsLoading && notifications.length === 0 ? <p className="site-notification-empty px-2 py-6 text-center text-sm">Loading notifications...</p> : null}
              {!notificationsLoading && notifications.length === 0 ? <div className="site-notification-empty px-2 py-8 text-center"><Bell className="mx-auto mb-3 h-5 w-5" aria-hidden="true" /><p className="text-sm font-semibold">You’re all caught up</p><p className="mt-1 text-xs">Updates about your music and account will appear here.</p></div> : null}
              {notifications.map((notification) => {
                const unread = !notification.readAt;
                const content = (
                  <article
                    className={clsx("site-notification-item rounded-2xl border p-3 transition", unread && "is-unread")}
                  >
                    <div className="flex gap-3">
                      <span className="site-notification-item-icon mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border">
                        {notification.priority === "high" ? <AlertCircle className="h-4 w-4" /> : <NotificationIcon type={notification.type} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold">{notification.title}</span>
                          {unread ? <span className="site-notification-unread-dot mt-1 h-2 w-2 shrink-0 rounded-full" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-soft)" }} />}
                        </span>
                        <span className="mt-1 block text-xs leading-5" style={{ color: "var(--text-muted)" }}>{customerMessage(notification.body)}</span>
                        <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-soft)" }}>
                          <span>{notificationTimeAgo(notification.createdAt)}</span>
                          {notification.href ? <span className="site-notification-action font-semibold">{notification.actionLabel || "Open"} →</span> : null}
                        </span>
                      </span>
                    </div>
                  </article>
                );

                if (!notification.href) {
                  return <button key={notification.id} type="button" onClick={() => markNotificationRead(notification.id)} className="site-notification-row text-left">{content}</button>;
                }

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={async () => {
                       const marked = await markNotificationRead(notification.id);
                       if (!marked) return;
                      router.push(notification.href as string);
                    }}
                    className="site-notification-row text-left"
                  >
                    {content}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    ) : null;

  const AppLauncher = ({ mobile = false }: { mobile?: boolean }) => user ? (
    <div data-app-launcher-root className="relative z-[1250] pointer-events-auto">
      <button type="button" onClick={() => { setAppLauncherOpen(value => !value); setProfileOpen(false); setNotificationsOpen(false); }} className={clsx("site-header-bare-icon inline-flex h-10 w-10 items-center justify-center rounded-full sm:h-11 sm:w-11", appLauncherOpen && "bg-[var(--bg-soft)]")} aria-label="Open HYMN apps" aria-expanded={appLauncherOpen} aria-haspopup="menu">
        <span className="grid grid-cols-3 gap-[3px]" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span key={index} className="h-[3px] w-[3px] rounded-full bg-current"/>)}</span>
      </button>
      {appLauncherOpen ? <div role="menu" aria-label="HYMN apps" className={clsx("z-[1260] rounded-[1.35rem] border border-[var(--border-strong)] bg-[var(--card-strong)] p-3 shadow-2xl", mobile ? "fixed left-3 right-3 top-[4.25rem] w-auto" : "absolute right-0 mt-3 w-[min(22rem,calc(100vw-1.5rem))]")}>
        <div className="px-2 pb-3 pt-1"><p className="hymn-kicker">HYMN workspace</p><p className="mt-1 text-sm text-[var(--text-muted)]">Choose where you want to work.</p></div>
        <div className="grid grid-cols-2 gap-2">
          <Link role="menuitem" href={user.role === "producer" ? "/producer/dashboard" : "/dashboard"} onClick={() => setAppLauncherOpen(false)} className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><LayoutDashboard className="h-5 w-5"/></span><strong className="mt-3 block text-sm">Dashboard</strong><span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">Account, releases, and earnings</span></Link>
          <Link role="menuitem" href="/studio" onClick={() => setAppLauncherOpen(false)} className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--info)_12%,transparent)] text-[var(--info)]"><Headphones className="h-5 w-5"/></span><strong className="mt-3 block text-sm">Studio</strong><span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">Mixing and mastering projects</span></Link>
          <Link role="menuitem" href="/services" onClick={() => setAppLauncherOpen(false)} className="group col-span-2 flex min-h-20 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]"><PackageCheck className="h-5 w-5"/></span><span className="min-w-0"><strong className="block text-sm">Services</strong><span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">Explore everything HYMN can do for your music</span></span></Link>
          <Link role="menuitem" href="/audio-library" onClick={() => setAppLauncherOpen(false)} className="group col-span-2 flex min-h-20 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)] p-3 transition hover:-translate-y-0.5 hover:border-[var(--border-strong)]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]"><Music2 className="h-5 w-5"/></span><span className="min-w-0"><strong className="block text-sm">Audio Library</strong><span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">Reuse original masters across releases</span></span></Link>
        </div>
      </div> : null}
    </div>
  ) : null;

  const ProfileMenu = ({ mobile = false }: { mobile?: boolean }) =>
    user ? (
      <div data-profile-menu-root className={clsx("relative", mobile ? "w-full" : "")}>
        <button
          type="button"
          onClick={() => { setProfileOpen((value) => { const next = !value; if (next) setPresenceExpanded(false); return next; }); setAppLauncherOpen(false); setNotificationsOpen(false); }}
          className={clsx(
            "inline-flex h-11 w-11 items-center justify-center rounded-full text-left transition hover:translate-y-[-1px]",
            mobile ? "w-full justify-start border p-1.5 pr-3" : "border-0 bg-transparent p-0"
          )}
          style={mobile ? { borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" } : { color: "var(--text)" }}
          aria-expanded={profileOpen}
          aria-haspopup="menu"
        >
          <span className="relative inline-flex h-10 w-10 shrink-0 rounded-full">
            <span
              className="inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full border text-xs font-bold"
              style={{ borderColor: "var(--border-strong)", background: "var(--bg-soft)", borderRadius: "50%", clipPath: "circle(50%)" }}
            >
              <Image
                src={user.avatarUrl || fallbackAvatar}
                alt={user.name}
                fill
                sizes="40px"
                className="rounded-full object-cover"
                style={{ borderRadius: "50%" }}
                unoptimized
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.src = fallbackAvatar;
                }}
              />
            </span>
            <span className="absolute bottom-0 right-0 grid h-3.5 w-3.5 place-items-center rounded-full border-[2.5px] shadow-sm" style={{ borderColor: "var(--header-bg-solid)", background: presence === "online" ? "var(--success)" : presence === "do_not_disturb" ? "var(--danger)" : "var(--text-soft)" }} aria-label={presenceOptions.find(option => option.value === presence)?.label}>
              {presence === "do_not_disturb" ? <span className="h-[2px] w-1.5 rounded-full bg-white" /> : presence === "invisible" ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--header-bg-solid)]" /> : null}
            </span>
          </span>
        </button>

        {profileOpen ? (
          <div
            role="menu"
            className={clsx(
              "z-50 mt-3 rounded-2xl border p-3 shadow-2xl",
              mobile ? "w-full" : "absolute right-0 w-80"
            )}
            style={{ borderColor: "var(--border)", background: "var(--card-strong)", color: "var(--text)" }}
          >
            <div className="border-b pb-3" style={{ borderColor: "var(--border)" }}>
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="mt-1 truncate text-xs" style={{ color: "var(--text-muted)" }}>{user.email}</p>
            </div>
            <div className="border-b py-3" style={{ borderColor: "var(--border)" }}>
              <button type="button" onClick={() => setPresenceExpanded(value => !value)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-[var(--hover)]" role="menuitem" aria-expanded={presenceExpanded}>
                <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full" style={{ background: presence === "online" ? "var(--success)" : presence === "do_not_disturb" ? "var(--danger)" : "var(--text-soft)" }}>{presence === "do_not_disturb" ? <span className="h-[2px] w-2 rounded-full bg-white" /> : presence === "invisible" ? <span className="h-2 w-2 rounded-full bg-[var(--card-strong)]" /> : null}</span>
                <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-soft)" }}>Profile status</span><strong className="mt-1 block text-xs font-semibold">{presenceOptions.find(option => option.value === presence)?.label}</strong></span>
                <ChevronDown className={clsx("h-4 w-4 shrink-0 transition-transform", presenceExpanded && "rotate-180")} style={{ color: "var(--text-soft)" }} />
              </button>
              {presenceExpanded ? <div className="mt-1 grid gap-1 rounded-xl border p-1.5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                {presenceOptions.map(option => <button key={option.value} type="button" disabled={presenceSaving} onClick={() => updatePresence(option.value)} className={clsx("flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--hover)] disabled:opacity-60", presence === option.value && "bg-[var(--hover)]")} role="menuitemradio" aria-checked={presence === option.value}>
                  <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full" style={{ background: option.value === "online" ? "var(--success)" : option.value === "do_not_disturb" ? "var(--danger)" : "var(--text-soft)" }}>{option.value === "do_not_disturb" ? <span className="h-[2px] w-2 rounded-full bg-white" /> : option.value === "invisible" ? <span className="h-2 w-2 rounded-full bg-[var(--card-strong)]" /> : null}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-xs font-semibold">{option.label}</strong><span className="mt-0.5 block text-[10px]" style={{ color: "var(--text-soft)" }}>{option.description}</span></span>
                  {presence === option.value ? <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} /> : null}
                </button>)}
              </div> : null}
            </div>
            <div className="mt-3 grid gap-1">
              <Link href={user.role === "producer" ? "/producer/dashboard" : "/dashboard"} onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[var(--hover)]">
                <UserRound className="h-4 w-4" />
                Update personal details
              </Link>
              <Link href="/dashboard/releases" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[var(--hover)]">
                <ShieldCheck className="h-4 w-4" />
                Releases and account status
              </Link>
              <Link href="/payout" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[var(--hover)]">
                <Bell className="h-4 w-4" />
                Payout
              </Link>
              <Link href="/faq" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[var(--hover)]">
                <HelpCircle className="h-4 w-4" />
                Help and FAQ
              </Link>
            </div>
            <button type="button" onClick={logout} className="mt-2 flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm font-semibold" style={{ borderColor: "var(--border)", color: "var(--danger)" }}>
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <header
      className="sticky top-0 z-[1200] overflow-visible border-b backdrop-blur-2xl backdrop-saturate-150"
      style={{
        borderColor: scrolled || open ? "var(--header-border)" : "transparent",
        background: scrolled || open ? "var(--header-bg-solid)" : "var(--header-bg)",
        boxShadow: scrolled ? "var(--header-shadow), inset 0 1px 0 rgba(255,255,255,0.12)" : "inset 0 1px 0 rgba(255,255,255,0.1)",
        transition: "background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease"
      }}
    >
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-1 px-3 py-2 sm:min-h-[4.5rem] sm:gap-4 sm:px-6 sm:py-3 lg:px-8">
        <Link href="/" className="flex min-w-0 shrink items-center" aria-label="HYMN Music home">
          <Image src="/assets/hymnlogowhite.png" alt="HYMN Music Logo" width={156} height={52} className="h-7 w-auto max-w-24 object-contain sm:h-9 sm:max-w-none lg:h-10" style={{ filter: "var(--logo-filter)" }} priority />
        </Link>

        <nav className="hymn-page-selector hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={(pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))) ? "page" : undefined}
              className={clsx("site-nav-item group relative px-3 py-2 text-sm font-medium", pathname === item.href ? "site-nav-link-active" : "site-nav-link")}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-3 lg:flex">
            <SmartHelpToggle />
            {!isAuthenticated ? <ThemeToggle /> : null}
            {isAuthenticated ? <AppLauncher /> : (
              <Link
                href="/login"
                className="site-header-cta inline-flex min-w-[120px] items-center justify-center rounded-full border px-4 py-2 text-center text-sm font-semibold"
                style={{ borderColor: "color-mix(in srgb, var(--accent) 42%, var(--border))", background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--accent-foreground)", boxShadow: "0 0 32px color-mix(in srgb, var(--accent) 18%, transparent)" }}
              >
                Login
              </Link>
            )}
            {isAuthenticated ? <NotificationBell /> : null}
            {isAuthenticated ? <ThemeToggle /> : null}
            {isAuthenticated ? <ProfileMenu /> : null}
          </div>

          <div className="flex items-center gap-0 lg:hidden">
            {isAuthenticated ? <AppLauncher mobile /> : null}
            {isAuthenticated ? <NotificationBell /> : null}
            <ThemeToggle />
            {isAuthenticated ? <ProfileMenu /> : null}
          </div>

          <button
            type="button"
            aria-label={cartCount ? `Shopping cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}` : "Shopping cart, empty"}
            aria-expanded={cartOpen}
            aria-haspopup="dialog"
            onClick={openCart}
            className="site-header-bare-icon site-cart-trigger relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent sm:h-11 sm:w-11"
            style={{ color: "var(--text)" }}
          >
            <span className={clsx("site-cart-visual", cartCount > 0 && "has-items")} aria-hidden="true">
              {cartCount > 0 ? <span className="site-cart-cargo"><span /><span /></span> : null}
              {cartDropSequence > 0 ? <span key={cartDropSequence} className="site-cart-drop" /> : null}
              <ShoppingCart className="site-cart-icon h-5 w-5" />
            </span>
            {cartCount > 0 ? <span className="site-cart-count" aria-hidden="true">{cartCount > 99 ? "99+" : cartCount}</span> : null}
          </button>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border sm:h-11 sm:w-11 lg:hidden"
            style={{ borderColor: "color-mix(in srgb, var(--glass-border) 88%, transparent)", background: "color-mix(in srgb, var(--glass-bg) 84%, transparent)", color: "var(--text)", backdropFilter: "blur(10px) saturate(140%)" }}
            onClick={() => { setOpen((value) => !value); setAppLauncherOpen(false); }}
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div id="site-mobile-nav" className="border-t lg:hidden" style={{ borderColor: "var(--glass-border)", background: "color-mix(in srgb, var(--glass-bg-strong) 88%, transparent)", backdropFilter: "blur(18px) saturate(155%)" }}>
          <div className="mx-auto flex max-h-[calc(100dvh-4rem)] max-w-7xl flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-4 sm:max-h-[calc(100dvh-4.5rem)] sm:px-6">
            {mainNav.map((item) => (
              <Link key={item.href} href={item.href} aria-current={(pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))) ? "page" : undefined} className="hymn-mobile-page-link rounded-lg border px-4 py-3 transition" onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            {!isAuthenticated ? (
              <Link href="/login" className="site-header-cta w-full rounded-full border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: "color-mix(in srgb, var(--accent) 42%, var(--border))", background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--accent-foreground)" }} onClick={() => setOpen(false)}>
                Login
              </Link>
            ) : null}

          </div>
        </div>
      ) : null}

      {cartMounted ? createPortal(<div className={clsx("fixed inset-0 isolate z-[1000] overflow-hidden transition", cartOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!cartOpen} inert={!cartOpen}>
        <button type="button" className={clsx("absolute inset-0 z-0 bg-black/60 transition-opacity", cartOpen ? "opacity-100" : "opacity-0")} onClick={() => setCartOpen(false)} aria-label="Close cart" />
        <aside className={clsx("site-cart-drawer fixed right-0 top-0 z-10 flex h-[100dvh] w-full max-w-[410px] flex-col border-l p-5 shadow-2xl transition-transform duration-300", cartOpen ? "translate-x-0" : "translate-x-full")} role="dialog" aria-modal="true" aria-label="Shopping cart">
          <div className="site-cart-drawer-heading flex items-center justify-between border-b border-[var(--border)] pb-4">
            <div><p className="text-xs uppercase tracking-[0.24em] text-[var(--text-soft)]">Your selection</p><h2 className="mt-1 text-xl font-semibold text-[var(--text)]">Beat cart <span className="site-cart-drawer-count">{cartCount}</span></h2></div>
            <button type="button" onClick={() => setCartOpen(false)} className="site-cart-close inline-flex h-10 w-10 items-center justify-center text-[var(--text-muted)] transition hover:text-[var(--text)]" aria-label="Close cart"><X className="h-5 w-5" /></button>
          </div>
          <div className="site-cart-drawer-items min-h-0 flex-1 space-y-3 overflow-y-auto py-5">
            {cartItems.length ? cartItems.map((item) => {
              const beat = cartBeats.find((entry) => entry.id === item.beatId);
              return <div key={`${item.beatId}-${item.licenseType}`} className="site-cart-drawer-item flex items-center gap-3 border-b border-[var(--border)] py-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--bg-soft)]">{beat?.artworkUrl ? <Image src={beat.artworkUrl} alt="" fill sizes="56px" className="object-cover" /> : <Disc3 className="absolute inset-0 m-auto h-5 w-5 text-[var(--text-soft)]" />}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--text)]">{beat?.title ?? `Beat ${item.beatId}`}</p><p className="mt-1 truncate text-xs text-[var(--text-soft)]">{beat?.producerName ?? "Beat licence"}</p><p className="mt-1 text-[11px] text-[var(--text-muted)]">{beatLicenseLabel(item.licenseType)} licence</p></div>
                <div className="text-right"><p className="text-sm font-semibold text-[var(--text)]">₹{Number(item.price).toLocaleString("en-IN")}</p><button type="button" onClick={() => removeCartItem(item.beatId, item.licenseType)} className="site-cart-remove mt-2 text-xs">Remove</button></div>
              </div>;
            }) : <div className="site-cart-empty py-12 text-center"><ShoppingCart className="mx-auto h-7 w-7" aria-hidden="true" /><p className="mt-4 text-sm font-semibold">Your cart is empty</p><p className="mt-1 text-xs">Find a beat that fits your next release.</p></div>}
          </div>
          <div className="site-cart-drawer-footer border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between text-sm"><span className="text-[var(--text-muted)]">Total</span><strong className="text-[var(--text)]">₹{cartItems.reduce((sum, item) => sum + Number(item.price || 0), 0).toLocaleString("en-IN")}</strong></div>
            {cartItems.length ? <Link href="/checkout?product=beatstore" onClick={() => setCartOpen(false)} className="btn-primary mt-4 w-full">Continue to checkout</Link> : <Link href="/beat-store" onClick={() => setCartOpen(false)} className="btn-primary mt-4 w-full">Browse beats</Link>}
          </div>
        </aside>
      </div>, document.body) : null}
    </header>
  );
}

import { customerMessage } from "@/lib/customer-message";


// vercel trigger

// vercel trigger 2

// vercel trigger 12

// vercel trigger 14
