"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { workspaceSwipeDirection } from "@/lib/workspace-page-transition";

export function WorkspacePageTransition() {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const snapshot = useRef<HTMLElement | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const observer = useRef<MutationObserver | null>(null);
  const targetPath = useRef<string | null>(null);
  function clearPending() {
    snapshot.current?.remove(); snapshot.current = null;
    clearTimeout(expiry.current);
    observer.current?.disconnect(); observer.current = null;
    targetPath.current = null;
    delete document.documentElement.dataset.workspaceNavigation;
  }
  useLayoutEffect(() => {
    const direction = workspaceSwipeDirection(previous.current, pathname);
    previous.current = pathname;
    if (!direction) { if (targetPath.current && pathname !== targetPath.current) clearPending(); return; }
    const root = document.documentElement;
    let timer: number | undefined;
    let revealed = false;
    function revealReadyPage() {
      if (revealed) return;
      const selector = `[data-workspace-page="${direction === "right" ? "dashboard" : "home"}"]`;
      const ready = [...document.querySelectorAll<HTMLElement>(selector)].some(node => !node.closest("[data-workspace-transition-snapshot]") && node.getClientRects().length && !node.querySelector("[data-workspace-loading]"));
      if (!ready) return;
      revealed = true;
      clearPending();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      root.dataset.workspaceSwipe = direction!;
      timer = window.setTimeout(() => { delete root.dataset.workspaceSwipe; }, 360);
    }
    observer.current = new MutationObserver(revealReadyPage);
    observer.current.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "hidden", "class"] });
    const frame = requestAnimationFrame(revealReadyPage);
    revealReadyPage();
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); observer.current?.disconnect(); observer.current = null; delete root.dataset.workspaceSwipe; };
  }, [pathname]);
  useEffect(() => {
    function leaving(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      const direction = workspaceSwipeDirection(previous.current, target.pathname);
      if (!direction) return;
      clearPending();
      const content = document.querySelector<HTMLElement>(".hymn-landing, .hymn-portal-root, main");
      if (!content) return;
      const cover = document.createElement("div");
      cover.dataset.workspaceTransitionSnapshot = "";
      cover.setAttribute("aria-hidden", "true");
      cover.inert = true;
      function preserve(element: HTMLElement) {
        const rect = element.getBoundingClientRect();
        const copy = element.cloneNode(true) as HTMLElement;
        copy.removeAttribute("id");
        copy.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
        copy.style.cssText += `;position:absolute;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;margin:0;`;
        cover.appendChild(copy);
        return () => {
          const originalNodes = [element, ...element.querySelectorAll<HTMLElement>("*")];
          const copiedNodes = [copy, ...copy.querySelectorAll<HTMLElement>("*")];
          originalNodes.forEach((node, index) => { if (copiedNodes[index]) { copiedNodes[index].scrollTop = node.scrollTop; copiedNodes[index].scrollLeft = node.scrollLeft; } });
        };
      }
      const restoreContentScroll = preserve(content);
      // On Home, SiteHeader is a sibling of the page, not inside its main.
      const header = document.querySelector<HTMLElement>("header.hymn-studio-header, body header");
      const restoreHeaderScroll = header && !content.contains(header) ? preserve(header) : null;
      document.body.appendChild(cover);
      restoreContentScroll(); restoreHeaderScroll?.();
      snapshot.current = cover;
      targetPath.current = target.pathname;
      document.documentElement.dataset.workspaceNavigation = "pending";
      // Recover normal loading/error behavior if navigation stalls or is cancelled.
      expiry.current = setTimeout(clearPending, 12000);
    }
    // Capture before Link handles navigation; leave modified clicks untouched.
    document.addEventListener("click", leaving, true);
    return () => { document.removeEventListener("click", leaving, true); clearPending(); };
  }, []);
  return null;
}
