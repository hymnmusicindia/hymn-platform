"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function GrowthTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!["/", "/distribution", "/first-release", "/first-release-free", "/contact", "/partnership-program", "/login"].includes(pathname)) return;
    const track = (event: string, id: string = crypto.randomUUID()) => {
      void fetch("/api/growth/events", { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true, body: JSON.stringify({ event, id, url: location.href, referrer: document.referrer }) }).catch(() => undefined);
    };
    const pageKey = `hymn-growth:${location.pathname}:${location.search}`;
    let pageId: string = crypto.randomUUID();
    try { const saved = sessionStorage.getItem(pageKey); if (saved) pageId = saved; else sessionStorage.setItem(pageKey, pageId); } catch { /* Storage is optional. */ }
    track(pathname === "/distribution" ? "distribution_viewed" : "landing_viewed", pageId);
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a,button") : null;
      const href = target?.getAttribute("href") || "";
      if (href.startsWith("https://wa.me/") || href.startsWith("https://api.whatsapp.com/")) track("whatsapp_clicked");
      else if (href.startsWith("/first-release") || href.startsWith("/distribution/start")) track("primary_cta_clicked");
      else if (href.startsWith("/login")) track("signup_started");
    };
    document.addEventListener("click", click);
    const pricing = document.getElementById("distribution-pricing");
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { track("pricing_viewed", `${pageId.slice(0, 35)}${pageId.endsWith("0") ? "1" : "0"}`); observer.disconnect(); } });
    if (pricing) observer.observe(pricing);
    return () => { document.removeEventListener("click", click); observer.disconnect(); };
  }, [pathname]);
  return null;
}
