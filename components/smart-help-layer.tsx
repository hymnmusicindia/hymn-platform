"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, Sparkles, X } from "lucide-react";
import { getAIHelpContext, type SmartHelpContext, type SmartHelpTrigger } from "@/lib/smart-help-context";
import { SMART_HELP_STATE_EVENT, SMART_HELP_TOGGLE_EVENT } from "@/components/smart-help-toggle";

type SmartTip = { title: string; tooltip: string; expanded_help: string; suggested_action: string; confidence: "high" | "medium" | "low" };
type Placement = { top: number; left: number; side: "top" | "right" | "bottom" | "left" };

const TARGET_SELECTOR = [
  "[data-smart-help]", "button:not([disabled])", "a[href]", "input:not([type=hidden])", "select", "textarea",
  "[role=button]", "[role=alert]", "[role=tab]", "[role=menuitem]", "[role=chart]", "canvas",
  "[data-empty-state]", ".empty-state", ".surface-card", ".metric-card", ".creator-section"
].join(",");

const cache = new Map<string, SmartTip>();
const compact = (value: unknown) => JSON.stringify(value);

function fallbackTip(context: SmartHelpContext): SmartTip {
  const label = context.element.label || "This item";
  const invalid = context.element.validationState === "invalid" || Boolean(context.element.errorText);
  return {
    title: invalid ? `Fix ${label}` : label,
    tooltip: invalid ? "Review the highlighted value before continuing." : `Use this to work with ${label.toLowerCase()}.`,
    expanded_help: context.element.errorText || context.element.nearbyText || `This control belongs to ${context.page.sectionName || context.page.pageTitle}.`,
    suggested_action: invalid ? "Correct the value and try again." : context.element.buttonText ? `Select ${context.element.buttonText}.` : "Review this item before continuing.",
    confidence: context.element.nearbyText ? "medium" : "low"
  };
}

function targetFrom(node: EventTarget | null) {
  if (!(node instanceof Element) || node.closest("[data-smart-help-ignore]")) return null;
  const target = node.closest(TARGET_SELECTOR);
  return target instanceof HTMLElement && !target.closest("[data-smart-help-ignore]") ? target : null;
}

function positionFor(element: HTMLElement): Placement {
  const rect = element.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 24); const height = 190; const gap = 14;
  if (window.innerWidth - rect.right >= width + gap) return { top: Math.max(12, Math.min(rect.top, window.innerHeight - height - 12)), left: rect.right + gap, side: "left" };
  if (rect.left >= width + gap) return { top: Math.max(12, Math.min(rect.top, window.innerHeight - height - 12)), left: rect.left - width - gap, side: "right" };
  if (window.innerHeight - rect.bottom >= height + gap) return { top: rect.bottom + gap, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), side: "top" };
  return { top: Math.max(12, rect.top - height - gap), left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), side: "bottom" };
}

export function SmartHelpLayer() {
  const [active, setActive] = useState(false);
  const [tip, setTip] = useState<SmartTip | null>(null);
  const [loading, setLoading] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ top: 80, left: 12, side: "top" });
  const targetRef = useRef<HTMLElement | null>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  const requestNumber = useRef(0);
  const recentActions = useRef<string[]>([]);

  const clearTarget = useCallback(() => {
    targetRef.current?.classList.remove("smart-help-target"); targetRef.current = null; setTip(null); setLoading(false);
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
  }, []);

  const requestTip = useCallback(async (element: HTMLElement, trigger: SmartHelpTrigger) => {
    const context = getAIHelpContext(element, trigger, recentActions.current);
    const key = compact({ route: context.page.route, element: context.element, trigger, role: context.user.role, device: context.user.deviceType });
    setPlacement(positionFor(element));
    if (cache.has(key)) { setTip(cache.get(key)!); setLoading(false); return; }
    const currentRequest = ++requestNumber.current; setLoading(true); setTip(null);
    try {
      const response = await fetch("/api/smart-help", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context }) });
      const data = await response.json().catch(() => ({}));
      if (currentRequest !== requestNumber.current) return;
      const next = response.ok && data.tip ? data.tip as SmartTip : fallbackTip(context);
      cache.set(key, next); setTip(next);
    } catch { if (currentRequest === requestNumber.current) { const next = fallbackTip(context); cache.set(key, next); setTip(next); } }
    finally { if (currentRequest === requestNumber.current) setLoading(false); }
  }, []);

  useEffect(() => {
    const toggle = () => setActive((value) => !value);
    window.addEventListener(SMART_HELP_TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(SMART_HELP_TOGGLE_EVENT, toggle);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("smart-help-active", active);
    window.dispatchEvent(new CustomEvent(SMART_HELP_STATE_EVENT, { detail: { active } }));
    if (!active) clearTarget();
    return () => document.documentElement.classList.remove("smart-help-active");
  }, [active, clearTarget]);

  useEffect(() => {
    if (!active) return;
    const onPointerMove = (event: PointerEvent) => { if (pointerRef.current) pointerRef.current.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`; };
    const onOver = (event: PointerEvent) => {
      const element = targetFrom(event.target); if (!element || element === targetRef.current) return;
      targetRef.current?.classList.remove("smart-help-target"); targetRef.current = element; element.classList.add("smart-help-target"); setTip(null); setLoading(false);
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      hoverTimer.current = window.setTimeout(() => void requestTip(element, element.matches(':invalid,[aria-invalid="true"],[role="alert"]') ? "error" : "hover"), 420);
    };
    const onClick = (event: MouseEvent) => {
      const element = targetFrom(event.target); if (!element) return;
      recentActions.current = [...recentActions.current.slice(-4), getAIHelpContext(element, "click").element.label];
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current); void requestTip(element, element.matches(':invalid,[aria-invalid="true"],[role="alert"]') ? "error" : "click");
    };
    const onFocus = (event: FocusEvent) => { const element = targetFrom(event.target); if (element) { targetRef.current?.classList.remove("smart-help-target"); targetRef.current = element; element.classList.add("smart-help-target"); void requestTip(element, "hover"); } };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setActive(false); };
    const reposition = () => { if (targetRef.current) setPlacement(positionFor(targetRef.current)); };
    document.addEventListener("pointermove", onPointerMove, { passive: true }); document.addEventListener("pointerover", onOver, true); document.addEventListener("click", onClick, true); document.addEventListener("focusin", onFocus, true); document.addEventListener("keydown", onKey); window.addEventListener("resize", reposition); window.addEventListener("scroll", reposition, true);
    return () => { document.removeEventListener("pointermove", onPointerMove); document.removeEventListener("pointerover", onOver, true); document.removeEventListener("click", onClick, true); document.removeEventListener("focusin", onFocus, true); document.removeEventListener("keydown", onKey); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [active, requestTip]);

  if (!active) return null;
  return <div data-smart-help-ignore className="smart-help-layer" aria-live="polite"><div ref={pointerRef} className="smart-help-pointer"><Sparkles /></div>{loading || tip ? <aside className={`smart-help-card points-${placement.side}`} style={{ top: placement.top, left: placement.left }}><button type="button" onClick={clearTarget} aria-label="Close help tip"><X /></button>{loading ? <div className="smart-help-loading"><LoaderCircle className="animate-spin" /><span>Generating help…</span></div> : tip ? <><p className="smart-help-kicker"><Sparkles />Contextual help</p><h2>{tip.title}</h2><p>{tip.tooltip}</p><div className="smart-help-expanded">{tip.expanded_help}</div><div className="smart-help-action"><ArrowRight /><span>{tip.suggested_action}</span></div></> : null}</aside> : null}</div>;
}
