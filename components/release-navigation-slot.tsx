"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const ReleaseNavigationTarget = createContext<HTMLElement | null | undefined>(undefined);

/** Keep editor state in the form while placing its navigation above the page. */
export function ReleaseNavigationSlot({ children }: { children: ReactNode }) {
  const target = useContext(ReleaseNavigationTarget);
  useEffect(() => {
    if (!target) return;
    const header = document.querySelector<HTMLElement>('[data-site-header]');
    const measure = () => {
      const fixed = header && /sticky|fixed/.test(getComputedStyle(header).position);
      target.style.setProperty('--release-site-header-height', `${fixed ? header.getBoundingClientRect().height : 0}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (header) observer.observe(header);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); target.style.removeProperty('--release-site-header-height'); };
  }, [target]);
  if (target === undefined) return children;
  return target ? createPortal(children, target) : null;
}
