"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { workspaceSwipeDirection } from "@/lib/workspace-page-transition";

const contentSelector = ".landing-canvas, .portal-workspace";
export function WorkspacePageTransition() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  useLayoutEffect(() => {
    const direction = workspaceSwipeDirection(previous.current, pathname);
    previous.current = pathname;
    if (!direction || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    root.dataset.workspaceSwipe = direction;
    const timer = window.setTimeout(() => { delete root.dataset.workspaceSwipe; }, 360);
    return () => { window.clearTimeout(timer); delete root.dataset.workspaceSwipe; };
  }, [pathname]);
  useEffect(() => {
    let exit: Animation | undefined;
    function leaving(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      const direction = workspaceSwipeDirection(pathname, target.pathname);
      if (!direction) return;
      const content = document.querySelector<HTMLElement>(contentSelector);
      if (!content?.animate) return;
      exit?.cancel();
      exit = content.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: `translateX(${direction === "right" ? 24 : -24}px)`, opacity: .6 }], { duration: 160, easing: "ease-out" });
    }
    // Capture before Link handles navigation; leave modified clicks untouched.
    document.addEventListener("click", leaving, true);
    return () => { document.removeEventListener("click", leaving, true); exit?.cancel(); };
  }, [pathname]);
  return null;
}
