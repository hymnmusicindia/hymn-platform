"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Bell, HelpCircle, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, ShoppingCart, UserRound, X } from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { mainNav } from "@/lib/site";
import { ThemeToggle } from "@/components/theme-toggle";
import type { SessionPayload } from "@/lib/types";

type SiteHeaderProps = {
  user?: SessionPayload | null;
};

export function SiteHeader({ user = null }: SiteHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const lastScrollRef = useRef(0);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    if (typeof window === "undefined") return;

    lastScrollRef.current = window.scrollY;
    const onScroll = () => {
      const current = window.scrollY;
      setScrolled(current > 18);
      lastScrollRef.current = current;
    };

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readCartCount = () => {
      try {
        const raw = window.localStorage.getItem("hymn-beat-cart");
        if (!raw) {
          setCartCount(0);
          return;
        }
        const cart = JSON.parse(raw);
        setCartCount(Array.isArray(cart) ? cart.length : 0);
      } catch {
        setCartCount(0);
      }
    };

    const onCartUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ count?: number }>).detail;
      if (typeof detail?.count === "number") {
        setCartCount(detail.count);
        return;
      }
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
    if (pathname?.startsWith("/beat-store")) {
      window.dispatchEvent(new CustomEvent("hymn-open-cart"));
      return;
    }
    router.push("/beat-store?cart=open");
  };

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    setProfileOpen(false);
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

  const ProfileMenu = ({ mobile = false }: { mobile?: boolean }) =>
    user ? (
      <div ref={profileMenuRef} className={clsx("relative", mobile ? "w-full" : "")}>
        <button
          type="button"
          onClick={() => setProfileOpen((value) => !value)}
          className={clsx(
            "inline-flex items-center gap-3 rounded-full border p-1.5 pr-3 text-left transition hover:translate-y-[-1px]",
            mobile ? "w-full justify-start" : ""
          )}
          style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
          aria-expanded={profileOpen}
          aria-haspopup="menu"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-bold" style={{ borderColor: "var(--border-strong)", background: "var(--bg-soft)" }}>
            <img
              src={user.avatarUrl || fallbackAvatar}
              alt={user.name}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
              onError={(event) => {
                event.currentTarget.src = fallbackAvatar;
              }}
            />
          </span>
          <span className={clsx("min-w-0", mobile ? "block" : "hidden xl:block")}>
            <span className="block truncate text-sm font-semibold">{user.name}</span>
            <span className="block truncate text-xs capitalize" style={{ color: "var(--text-soft)" }}>{user.role}</span>
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
              <Link href="/dashboard" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/5">
                <UserRound className="h-4 w-4" />
                Update personal details
              </Link>
              <Link href="/dashboard/releases" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/5">
                <ShieldCheck className="h-4 w-4" />
                Releases and account status
              </Link>
              <Link href="/royalty-payouts" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/5">
                <Bell className="h-4 w-4" />
                Royalty payouts
              </Link>
              <Link href="/faq" onClick={() => setProfileOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-white/5">
                <HelpCircle className="h-4 w-4" />
                Help and FAQ
              </Link>
              <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <span className="inline-flex items-center gap-3 text-sm font-medium">
                  <Settings className="h-4 w-4" />
                  Change theme
                </span>
                <ThemeToggle />
              </div>
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
      className="sticky top-0 z-50 border-b backdrop-blur-xl"
      style={{
        borderColor: scrolled || open ? "var(--header-border)" : "transparent",
        background: scrolled || open ? "var(--header-bg-solid)" : "var(--header-bg)",
        boxShadow: scrolled ? "var(--header-shadow)" : "none",
        transition: "background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease"
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center" aria-label="HYMN Music home">
          <Image src="/assets/hymnlogowhite.png" alt="HYMN Music Logo" width={156} height={52} className="h-7 w-auto object-contain sm:h-9 lg:h-10" style={{ filter: "var(--logo-filter)" }} priority />
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

        <div className="hidden items-center gap-3 lg:flex">
          {!isAuthenticated ? <ThemeToggle /> : null}
          {isAuthenticated ? (
            <Link
              href="/dashboard"
              className="site-header-soft-button inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold backdrop-blur-xl"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="site-header-login inline-flex items-center justify-center rounded-full px-3 py-2 text-sm font-semibold"
            >
              Login
            </Link>
          )}
          {isAuthenticated ? (
            <ProfileMenu />
          ) : (
            <Link
              href="/login"
              className="site-header-cta inline-flex min-w-[142px] items-center justify-center rounded-full border px-4 py-2 text-center text-sm font-semibold"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 42%, var(--border))", background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--accent-foreground)", boxShadow: "0 0 32px color-mix(in srgb, var(--accent) 18%, transparent)" }}
            >
              Join Platform
            </Link>
          )}
          <button
            type="button"
            aria-label="Shopping cart"
            onClick={openCart}
            className="site-icon-button relative inline-flex h-11 w-11 items-center justify-center rounded-lg border"
            style={{ borderColor: "color-mix(in srgb, var(--glass-border) 88%, transparent)", background: "color-mix(in srgb, var(--glass-bg) 84%, transparent)", color: "var(--text)", backdropFilter: "blur(10px) saturate(140%)" }}
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}>
              {cartCount}
            </span>
          </button>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border lg:hidden"
          style={{ borderColor: "color-mix(in srgb, var(--glass-border) 88%, transparent)", background: "color-mix(in srgb, var(--glass-bg) 84%, transparent)", color: "var(--text)", backdropFilter: "blur(10px) saturate(140%)" }}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="site-mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div id="site-mobile-nav" className="border-t lg:hidden" style={{ borderColor: "var(--glass-border)", background: "color-mix(in srgb, var(--glass-bg-strong) 88%, transparent)", backdropFilter: "blur(18px) saturate(155%)" }}>
          <div className="mx-auto flex max-h-[calc(100vh-4rem)] max-w-7xl flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
            {mainNav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-lg border px-4 py-3 transition" style={{ color: "var(--text-muted)", background: "color-mix(in srgb, var(--glass-bg) 75%, transparent)", borderColor: "color-mix(in srgb, var(--glass-border) 72%, transparent)" }} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            <ThemeToggle compact />
            {isAuthenticated ? (
              <>
                <Link href="/dashboard" className="w-full rounded-full border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "var(--text)" }} onClick={() => setOpen(false)}>
                  Dashboard
                </Link>
                <ProfileMenu mobile />
              </>
            ) : (
              <>
                <Link href="/login" className="w-full rounded-full border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", color: "var(--text)" }} onClick={() => setOpen(false)}>
                  Login
                </Link>
                <Link href="/login" className="site-header-cta w-full rounded-full border px-4 py-3 text-center text-sm font-semibold" style={{ borderColor: "color-mix(in srgb, var(--accent) 42%, var(--border))", background: "linear-gradient(180deg, var(--accent-strong), var(--accent))", color: "var(--accent-foreground)" }} onClick={() => setOpen(false)}>
                  Join Platform
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={openCart}
              className="site-icon-button flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm font-semibold"
              style={{ color: "var(--text)", background: "color-mix(in srgb, var(--glass-bg) 75%, transparent)", borderColor: "color-mix(in srgb, var(--glass-border) 72%, transparent)" }}
            >
              <span className="inline-flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Cart
              </span>
              <span className="inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}>
                {cartCount}
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}

