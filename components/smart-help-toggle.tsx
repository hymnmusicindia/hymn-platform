"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import clsx from "clsx";

export const SMART_HELP_TOGGLE_EVENT = "hymn-smart-help-toggle";
export const SMART_HELP_STATE_EVENT = "hymn-smart-help-state";

export function SmartHelpToggle({ compact = false }: { compact?: boolean }) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const listener = (event: Event) => setActive(Boolean((event as CustomEvent<{ active: boolean }>).detail?.active));
    window.addEventListener(SMART_HELP_STATE_EVENT, listener);
    return () => window.removeEventListener(SMART_HELP_STATE_EVENT, listener);
  }, []);
  return <button type="button" data-smart-help-ignore className={clsx("smart-help-top-toggle", compact && "is-compact", active && "is-active")} aria-pressed={active} aria-label={active ? "Exit AI Help mode" : "Activate AI Help mode"} onClick={() => window.dispatchEvent(new CustomEvent(SMART_HELP_TOGGLE_EVENT))}><Sparkles />{compact ? null : <span>{active ? "Exit Help" : "AI Help"}</span>}</button>;
}
