"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, Bell, CheckCircle2, Disc3, HelpCircle, LayoutDashboard, LogOut, Menu, PackageCheck, ShieldCheck, ShoppingCart, UserRound, WalletCards, X } from "lucide-react";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { mainNav } from "@/lib/site";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SessionPayload } from "@/lib/types";

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

type HeaderCartItem = { beatId: number; licenseType: "basic" | "exclusive"; price: number };
type HeaderCartBeat = { id: number; title: string; producerName?: string; artworkUrl?: string };

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
  const [scrolled, setScrolled] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<HeaderCartItem[]>([]);
  const [cartBeats, setCartBeats] = useState<HeaderCartBeat[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<HeaderNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const notificationMutationsRef = useRef<Set<number>>(new Set());
  const markAllPendingRef = useRef(false);
  const isAuthenticated = Boolean(user);

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

    const onPointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [profileOpen]);

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
    void loadNotifications();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications();
    }, 120_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && notificationsOpen) void loadNotifications();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isAuthenticated, loadNotifications, notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen || !isAuthenticated) return;
    void loadNotifications();
  }, [isAuthenticated, loadNotifications, notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [notificationsOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readCartCount = () => {
      try {
        const raw = window.localStorage.getItem("hymn-beat-cart");
        if (!raw) {
          setCartItems([]);
          setCartCount(0);
          return;
        }
        const cart = JSON.parse(raw);
        const items = Array.isArray(cart) ? cart : [];
        setCartItems(items);
        setCartCount(items.length);
      } catch {
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
    window.dispatchEvent(new CustomEvent("hymn-cart-updated", { detail: { count: next.length } }));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    setProfileOpen(false);
    setNotificationsOpen(false);
    router.push("/");
    router.refresh();
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
      <div ref={notificationMenuRef} className={clsx("relative", mobile ? "w-full" : "")}>
        <button
          type="button"
          onClick={() => { setNotificationsOpen((value) => !value); setProfileOpen(false); }}
          className={clsx("site-header-bare-icon relative inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-transparent sm:h-11 sm:w-11", mobile ? "w-full justify-start gap-3 px-3" : "")}
          style={{ color: "var(--text)" }}
          aria-expanded={notificationsOpen}
          aria-haspopup="dialog"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {mobile ? <span className="text-sm font-semibold">Notifications</span> : null}
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[9px] font-extrabold leading-none shadow-sm" style={{ borderColor: "var(--header-bg-solid)", background: "var(--text)", color: "var(--bg)" }}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>

        {notificationsOpen ? (
          <div
            role="dialog"
            aria-label="Notifications"
            onMouseDown={(event) => event.stopPropagation()}
            className={clsx("site-notification-panel z-50 mt-3 rounded-2xl border p-3 shadow-2xl", mobile ? "w-full" : "absolute right-0 w-[min(24rem,calc(100vw-2rem))]")}
            style={{ borderColor: "var(--border)", background: "var(--card-strong)", color: "var(--text)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: "var(--border)" }}>
              <div>
                <p className="text-sm font-semibold">Notifications</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{unreadCount ? `${unreadCount} unread` : "All caught up"}</p>
              </div>
              <button type="button" onClick={markAllNotificationsRead} disabled={unreadCount === 0} className="rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-40" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                Mark all as read
              </button>
            </div>
            <div className="mt-3 grid max-h-[28rem] gap-2 overflow-y-auto pr-1">
              {notificationsLoading && notifications.length === 0 ? <p className="px-2 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>Loading notifications...</p> : null}
              {!notificationsLoading && notifications.length === 0 ? <p className="px-2 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>No notifications yet.</p> : null}
              {notifications.map((notification) => {
                const unread = !notification.readAt;
                const content = (
                  <article
                    className="rounded-2xl border p-3 transition hover:-translate-y-0.5"
                    style={{
                      borderColor: notification.priority === "high" ? "rgba(248,113,113,0.45)" : unread ? "color-mix(in srgb, var(--accent) 45%, var(--border))" : "var(--border)",
                      background: unread ? "linear-gradient(180deg, color-mix(in srgb, var(--accent) 13%, transparent), color-mix(in srgb, var(--card) 94%, transparent))" : "var(--card)"
                    }}
                  >
                    <div className="flex gap-3">
                      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: notification.priority === "high" ? "var(--danger)" : "var(--accent)" }}>
                        {notification.priority === "high" ? <AlertCircle className="h-4 w-4" /> : <NotificationIcon type={notification.type} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold">{notification.title}</span>
                          {unread ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--text-soft)" }} />}
                        </span>
                        <span className="mt-1 block text-xs leading-5" style={{ color: "var(--text-muted)" }}>{notification.body}</span>
                        <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-soft)" }}>
                          <span>{notificationTimeAgo(notification.createdAt)}</span>
                          {notification.href ? <span className="font-semibold" style={{ color: "var(--accent)" }}>{notification.actionLabel || "Open"}</span> : null}
                        </span>
                      </span>
                    </div>
                  </article>
                );

                if (!notification.href) {
                  return <button key={notification.id} type="button" onClick={() => markNotificationRead(notification.id)} className="text-left">{content}</button>;
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
                    className="text-left"
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

  const ProfileMenu = ({ mobile = false }: { mobile?: boolean }) =>
    user ? (
      <div ref={profileMenuRef} className={clsx("relative", mobile ? "w-full" : "")}>
        <button
          type="button"
          onClick={() => setProfileOpen((value) => !value)}
          className={clsx(
            "inline-flex h-11 w-11 items-center justify-center rounded-full text-left transition hover:translate-y-[-1px]",
            mobile ? "w-full justify-start border p-1.5 pr-3" : "border-0 bg-transparent p-0"
          )}
          style={mobile ? { borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" } : { color: "var(--text)" }}
          aria-expanded={profileOpen}
          aria-haspopup="menu"
        >
          <span className="relative inline-flex h-10 w-10 shrink-0">
            <span className="inline-flex h-full w-full items-center justify-center overflow-hidden rounded-full border text-xs font-bold" style={{ borderColor: "var(--border-strong)", background: "var(--bg-soft)" }}>
              <Image
                src={user.avatarUrl || fallbackAvatar}
                alt={user.name}
                fill
                sizes="40px"
                className="object-cover"
                unoptimized
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.src = fallbackAvatar;
                }}
              />
            </span>
            <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 shadow-sm" style={{ borderColor: "var(--header-bg-solid)", background: "var(--success)" }} aria-label="Online" />
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
            <div className="mt-3 grid gap-1">
              <Link href={user.role === "producer" ? "/producer/dashboard" : "/dashboard"} onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/5">
                <UserRound className="h-4 w-4" />
                Update personal details
              </Link>
              <Link href="/dashboard/releases" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/5">
                <ShieldCheck className="h-4 w-4" />
                Releases and account status
              </Link>
              <Link href="/payout" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/5">
                <Bell className="h-4 w-4" />
                Payout
              </Link>
              <Link href="/faq" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/5">
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
      className="sticky top-0 z-50 border-b backdrop-blur-2xl backdrop-saturate-150"
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

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
          {mainNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx("site-nav-item group relative px-3 py-2 text-sm font-medium", pathname === item.href ? "site-nav-link-active" : "site-nav-link")}
            >
              {item.label}
              <span className={clsx("absolute inset-x-3 -bottom-0.5 h-px origin-left rounded-full bg-[var(--accent)] transition duration-300", pathname === item.href ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-100")} />
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-3 lg:flex">
            {!isAuthenticated ? <ThemeToggle /> : null}
            {isAuthenticated ? (
              <Link
                href={user?.role === "producer" ? "/producer/dashboard" : "/dashboard"}
                className="site-header-soft-button inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold backdrop-blur-xl"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            ) : (
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
            {isAuthenticated ? <NotificationBell /> : null}
            <ThemeToggle />
            {isAuthenticated ? <ProfileMenu /> : null}
          </div>

          <button
            type="button"
            aria-label="Shopping cart"
            onClick={openCart}
            className="site-header-bare-icon relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent sm:h-11 sm:w-11"
            style={{ color: "var(--text)" }}
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 ? <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[9px] font-extrabold leading-none shadow-sm" style={{ borderColor: "var(--header-bg-solid)", background: "var(--text)", color: "var(--bg)" }}>
              {cartCount > 99 ? "99+" : cartCount}
            </span> : null}
          </button>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border sm:h-11 sm:w-11 lg:hidden"
            style={{ borderColor: "color-mix(in srgb, var(--glass-border) 88%, transparent)", background: "color-mix(in srgb, var(--glass-bg) 84%, transparent)", color: "var(--text)", backdropFilter: "blur(10px) saturate(140%)" }}
            onClick={() => setOpen((value) => !value)}
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
              <Link key={item.href} href={item.href} className="rounded-lg border px-4 py-3 transition" style={{ color: "var(--text-muted)", background: "color-mix(in srgb, var(--glass-bg) 75%, transparent)", borderColor: "color-mix(in srgb, var(--glass-border) 72%, transparent)" }} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            {isAuthenticated ? (
              <Link href={user?.role === "producer" ? "/producer/dashboard" : "/dashboard"} className="w-full rounded-full border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "var(--text)" }} onClick={() => setOpen(false)}>
                Dashboard
              </Link>
            ) : (
              <Link href="/login" className="site-header-cta w-full rounded-full border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: "color-mix(in srgb, var(--accent) 42%, var(--border))", background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--accent-foreground)" }} onClick={() => setOpen(false)}>
                Login
              </Link>
            )}

          </div>
        </div>
      ) : null}

      <div className={clsx("fixed inset-0 z-[100] transition", cartOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!cartOpen}>
        <button type="button" className={clsx("absolute inset-0 bg-black/45 transition-opacity", cartOpen ? "opacity-100" : "opacity-0")} onClick={() => setCartOpen(false)} aria-label="Close cart" />
        <aside className={clsx("absolute right-0 top-0 flex h-[100dvh] w-full max-w-[410px] flex-col border-l p-5 shadow-2xl transition-transform duration-300", cartOpen ? "translate-x-0" : "translate-x-full")} style={{ borderColor: "var(--border)", backgroundColor: "var(--bg)", color: "var(--text)", opacity: 1 }} role="dialog" aria-modal="true" aria-label="Shopping cart">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
            <div><p className="text-xs uppercase tracking-[0.24em] text-[var(--text-soft)]">Cart</p><h2 className="mt-1 text-xl font-semibold text-[var(--text)]">Your beats</h2></div>
            <button type="button" onClick={() => setCartOpen(false)} className="inline-flex h-10 w-10 items-center justify-center text-[var(--text-muted)] transition hover:text-[var(--text)]" aria-label="Close cart"><X className="h-5 w-5" /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-5">
            {cartItems.length ? cartItems.map((item) => {
              const beat = cartBeats.find((entry) => entry.id === item.beatId);
              return <div key={`${item.beatId}-${item.licenseType}`} className="flex items-center gap-3 border-b border-[var(--border)] py-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--bg-soft)]">{beat?.artworkUrl ? <Image src={beat.artworkUrl} alt="" fill sizes="56px" className="object-cover" /> : <Disc3 className="absolute inset-0 m-auto h-5 w-5 text-[var(--text-soft)]" />}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--text)]">{beat?.title ?? `Beat ${item.beatId}`}</p><p className="mt-1 truncate text-xs text-[var(--text-soft)]">{beat?.producerName ?? (item.licenseType === "exclusive" ? "Exclusive licence" : "Non-exclusive licence")}</p></div>
                <div className="text-right"><p className="text-sm font-semibold text-[var(--text)]">₹{Number(item.price).toLocaleString("en-IN")}</p><button type="button" onClick={() => removeCartItem(item.beatId, item.licenseType)} className="mt-1 text-xs text-[var(--danger)]">Remove</button></div>
              </div>;
            }) : <div className="py-12 text-center text-sm text-[var(--text-soft)]">Your cart is empty.</div>}
          </div>
          <div className="border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between text-sm"><span className="text-[var(--text-muted)]">Total</span><strong className="text-[var(--text)]">₹{cartItems.reduce((sum, item) => sum + Number(item.price || 0), 0).toLocaleString("en-IN")}</strong></div>
            {cartItems.length ? <Link href="/checkout?product=beatstore" onClick={() => setCartOpen(false)} className="btn-primary mt-4 w-full">Continue to checkout</Link> : <Link href="/beat-store" onClick={() => setCartOpen(false)} className="btn-primary mt-4 w-full">Browse beats</Link>}
          </div>
        </aside>
      </div>
    </header>
  );
}


// vercel trigger

// vercel trigger 2

// vercel trigger 12

// vercel trigger 14
