"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import styles from "./release-actions-menu.module.css";

export function ReleaseActionsMenu({ title, canDelete, busy, onDuplicate, onDelete, onBlockedDelete }: {
  title: string; canDelete: boolean; busy: boolean; onDuplicate: () => void; onDelete: () => void; onBlockedDelete: () => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const lastItem = useRef(false);

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor || !popup.current) return;
      const { width, height } = popup.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth);
      const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight);
      const below = anchor.bottom + 8;
      setPosition({
        left: Math.max(leftEdge + 8, Math.min(anchor.right - width, rightEdge - width - 8)),
        top: Math.max(topEdge + 8, Math.min(below + height > bottomEdge - 8 ? anchor.top - height - 8 : below, bottomEdge - height - 8))
      });
    }
    place();
    const items = popup.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[lastItem.current ? items.length - 1 : 0]?.focus({ preventScroll: true });
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popup.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function close() { setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  return <>
    <div className={styles.anchor}><button ref={trigger} type="button" disabled={busy} aria-label={`Actions for ${title}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} className={styles.trigger} onClick={() => { lastItem.current = false; setOpen(value => !value); }} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); lastItem.current = event.key === "ArrowUp"; setOpen(true); }
    }}><MoreHorizontal size={20} aria-hidden="true" /></button></div>
    {open ? createPortal(<div ref={popup} id={id} role="menu" aria-label={`Release actions for ${title}`} className={styles.menu} style={position} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null) && event.relatedTarget !== trigger.current) setOpen(false);
    }} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === "Tab") { close(); return; }
      const items = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    }}>
      <button role="menuitem" type="button" onClick={() => { close(); onDuplicate(); }}><Copy size={16} aria-hidden="true" /><span>Duplicate release</span></button>
      <button role="menuitem" type="button" aria-disabled={!canDelete} className={styles.delete} title={canDelete ? undefined : "Only drafts can be deleted."} onClick={() => { close(); if (canDelete) onDelete(); else onBlockedDelete(); }}><Trash2 size={16} aria-hidden="true" /><span>Delete release</span></button>
    </div>, document.body) : null}
  </>;
}
