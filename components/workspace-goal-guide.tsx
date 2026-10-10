"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowRight, Compass, X } from "lucide-react";
import { guideKey, homeGoal, onboardingTarget, type HomeGuide } from "@/lib/home-goals";

type Bounds = { top: number; left: number; width: number; height: number };

/** Optional contextual help follows the user's real navigation, never submitting work. */
export function WorkspaceGoalGuide({ userId }: { userId: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [guide, setGuide] = useState<HomeGuide | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panelHeight, setPanelHeight] = useState(240);
  const targetRef = useRef<HTMLElement | null>(null);
  const sourceRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function start(event: Event) {
      const detail = (event as CustomEvent<HomeGuide>).detail;
      if (!detail || detail.userId !== userId) return;
      sourceRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setGuide({ ...detail, href: onboardingTarget(detail.href, detail.goalId) });
    }
    try {
      const raw = sessionStorage.getItem(guideKey(userId));
      if (raw) {
        const saved: HomeGuide = JSON.parse(raw);
        if (saved.userId === userId && saved.href && saved.title && ["navigation", "destination"].includes(saved.phase)) setGuide({ ...saved, href: onboardingTarget(saved.href, saved.goalId) });
      }
    } catch { /* Storage is optional. */ }
    window.addEventListener("hymn-start-goal-guide", start);
    return () => window.removeEventListener("hymn-start-goal-guide", start);
  }, [userId]);

  useEffect(() => {
    if (!guide) return;
    const destination = new URL(guide.href, window.location.origin);
    if (guide.phase === "navigation" && pathname === destination.pathname && window.location.search === destination.search) {
      setGuide(current => current ? { ...current, phase: "destination" } : null);
      return;
    }
    try { sessionStorage.setItem(guideKey(userId), JSON.stringify(guide)); } catch { /* Storage is optional. */ }
    if (guide.phase === "navigation") window.dispatchEvent(new CustomEvent("hymn-reveal-service", { detail: homeGoal(guide.goalId).group }));
  }, [guide, pathname, userId]);

  function finish() {
    try { sessionStorage.removeItem(guideKey(userId)); } catch { /* Storage is optional. */ }
    setGuide(null); setBounds(null);
    window.dispatchEvent(new Event("hymn-hide-service"));
    if (guide?.phase === "destination") {
      const heading = document.querySelector<HTMLElement>("main h1, main h2");
      heading?.setAttribute("tabindex", "-1"); heading?.focus();
    } else sourceRef.current?.focus();
  }

  useEffect(() => {
    if (!guide) return;
    let frame = 0;
    let lastTarget: HTMLElement | null = null;
    const destinationPath = new URL(guide.href, window.location.origin).pathname;
    function measure() {
      const candidates = guide!.phase === "navigation"
        ? Array.from(document.querySelectorAll<HTMLElement>("[data-guide-route], .landing-new, .dashboard-os-nav-item[href]"))
            .filter(node => {
              const href = node.dataset.guideRoute || node.getAttribute("href");
              if (!href) return false;
              const link = new URL(href, window.location.origin);
              const destination = new URL(guide!.href, window.location.origin);
              return link.pathname === destinationPath && (!destination.searchParams.has("tab") || link.searchParams.get("tab") === destination.searchParams.get("tab"));
            }).sort((a, b) => Number(Boolean(b.dataset.guideRoute)) - Number(Boolean(a.dataset.guideRoute)))
        : pathname === destinationPath ? Array.from(document.querySelectorAll<HTMLElement>("main form h2, main h1, main h2, [data-guide-destination]")) : [];
      const target = candidates.find(node => node.getClientRects().length > 0 && !node.closest("[hidden]")) ?? null;
      targetRef.current = target;
      if (target && target !== lastTarget) {
        lastTarget = target;
        target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
        if (guide!.phase === "navigation") target.focus({ preventScroll: true });
      }
      const rect = target?.getBoundingClientRect();
      const next = rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null;
      setBounds(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setViewport(previous => previous.width === window.innerWidth && previous.height === window.innerHeight ? previous : { width: window.innerWidth, height: window.innerHeight });
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const panelObserver = new ResizeObserver(entries => { const height = Math.ceil(entries[0]?.contentRect.height || 200) + 40; setPanelHeight(height); });
    if(panelRef.current) panelObserver.observe(panelRef.current);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "aria-expanded"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    function activate(event: MouseEvent) {
      if (guide!.phase !== "navigation" || !targetRef.current?.contains(event.target as Node)) return;
      event.preventDefault(); event.stopPropagation();
      setGuide(current => current ? { ...current, phase: "destination" } : null);
      window.dispatchEvent(new Event("hymn-hide-service"));
      router.push(guide!.href);
    }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); finish(); } }
    document.addEventListener("click", activate, true);
    document.addEventListener("keydown", escape);
    schedule();
    return () => {
      observer.disconnect(); panelObserver.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);
      document.removeEventListener("click", activate, true); document.removeEventListener("keydown", escape);
    };
    // The guide object owns the callbacks for this specific route and phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, pathname, router]);

  if (!guide || typeof document === "undefined") return null;
  const width = Math.min(340, Math.max(260, viewport.width - 32));
  const left = bounds && viewport.width >= 1024 ? Math.min(bounds.left + bounds.width + 20, viewport.width - width - 16) : Math.max(16, (viewport.width - width) / 2);
  const top = bounds ? viewport.width >= 1024
    ? Math.max(76, Math.min(bounds.top, viewport.height - panelHeight - 16))
    : bounds.top > viewport.height / 2
      ? Math.max(72, bounds.top - panelHeight - 20)
      : Math.max(72, Math.min(bounds.top + bounds.height + 20, viewport.height - panelHeight - 16))
    : undefined;
  const arrived = guide.phase === "destination" && pathname === new URL(guide.href, window.location.origin).pathname;
  return createPortal(<div className="home-goal-guide-layer">
    {bounds ? <div className="home-goal-guide-ring" style={{ top: bounds.top - 5, left: bounds.left - 5, width: bounds.width + 10, height: bounds.height + 10 }} aria-hidden="true" /> : null}
    <section ref={panelRef} className="home-goal-guide-panel" aria-label="Guided path" style={{ width, left, top, bottom: top === undefined ? 18 : undefined }}>
      <header><span><Compass size={15} /> {arrived ? "YOU'RE IN THE RIGHT PLACE" : "YOUR NEXT CLICK"}</span><button type="button" onClick={finish} aria-label="Close guided path"><X size={17} /></button></header>
      <div aria-live="polite"><h2>{guide.title}</h2><p>{arrived ? guide.description : bounds ? "Select the highlighted option to open the tool for this step." : "Open the tool directly to continue your chosen path."}</p></div>
      {arrived ? <button type="button" className="home-goal-primary" onClick={finish}>Got it. Let's do this <ArrowRight size={15} /></button> : <button type="button" onClick={() => { setGuide(current => current ? { ...current, phase:"destination" } : null); window.dispatchEvent(new Event("hymn-hide-service")); router.push(guide.href); }}>Open directly <ArrowRight size={15} /></button>}
      <small>This guide won't submit work or mark your task complete.</small>
    </section>
  </div>, document.body);
}
