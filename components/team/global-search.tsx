"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import styles from "./global-search.module.css";

type Result = { id: string; kind: string; title: string; detail: string; href: string };
type Api = <T>(resource: string, body?: unknown) => Promise<T>;

const kindLabel: Record<string, string> = {
  contact: "Contact",
  task: "Work",
  consultation: "Consultation",
  lead: "Lead",
};

export function TeamGlobalSearch({ api }: { api: Api }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const listId = "team-global-search-results";

  useEffect(() => {
    const focusSearch = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setItems([]);
      setError("");
      setLoading(false);
      return;
    }
    let activeRequest = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      api<{ items: Result[] }>(`team-search?q=${encodeURIComponent(query.trim())}`)
        .then(result => {
          if (activeRequest) {
            setItems(result.items);
            setError("");
            setActive(0);
          }
        })
        .catch(cause => {
          if (activeRequest) setError(cause instanceof Error ? cause.message : "Search is unavailable.");
        })
        .finally(() => {
          if (activeRequest) setLoading(false);
        });
    }, 180);
    return () => {
      activeRequest = false;
      window.clearTimeout(timer);
    };
  }, [api, query]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLAnchorElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      input.current?.focus();
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && items.length) {
      event.preventDefault();
      setOpen(true);
      const currentIndex = links.current.findIndex(link => link === document.activeElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = currentIndex < 0 ? 0 : (currentIndex + step + items.length) % items.length;
      setActive(next);
      links.current[next]?.focus();
    } else if (event.key === "Enter" && items.length && event.currentTarget === input.current) {
      event.preventDefault();
      links.current[active]?.click();
    }
  }

  return <div className={styles.search} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <Search size={16} aria-hidden="true"/>
    <input
      ref={input}
      type="search"
      role="combobox"
      aria-label="Search contacts, consultations and work"
      aria-autocomplete="list"
      aria-expanded={open && query.trim().length >= 2}
      aria-controls={listId}
      placeholder="Search contacts, consultations, work…"
      value={query}
      onFocus={() => setOpen(true)}
      onChange={event => { setQuery(event.target.value); setOpen(true); }}
      onKeyDown={onKeyDown}
    />
    <kbd>Ctrl K</kbd>
    {open && query.trim().length >= 2 ? <div id={listId} className={styles.results} role="listbox" aria-label="Search results">
      {loading ? <p role="status">Searching…</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {!loading && !error && !items.length ? <p>No contacts, consultation requests or open work matched that search.</p> : null}
      {items.map((item, index) => <Link
        key={`${item.kind}:${item.id}`}
        ref={element => { links.current[index] = element; }}
        className={styles.result}
        href={item.href}
        role="option"
        aria-selected={active === index}
        onMouseEnter={() => setActive(index)}
        onKeyDown={onKeyDown}
        onClick={() => setOpen(false)}
      >
        <span className={styles.kind}>{kindLabel[item.kind] || "Record"}</span>
        <span className={styles.copy}><strong>{item.title}</strong><small>{item.detail}</small></span>
      </Link>)}
    </div> : null}
  </div>;
}
