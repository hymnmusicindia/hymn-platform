"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
type Workspace = { id: string; name: string; kind: string; href: string };
export function InternalWorkspaceSwitcher({ current, name }: { current: string; name: string }) {
  const [items, setItems] = useState<Workspace[]>([]); const router = useRouter();
  useEffect(() => { let live = true; fetch("/api/workspaces", { cache: "no-store" }).then(r => r.ok ? r.json() : { items: [] }).then(r => { if (live) setItems(r.items); }).catch(() => {}); return () => { live = false; }; }, []);
  return <label style={{ display: "grid", gap: 6, fontSize: 11, color: "#b9c4d6" }}>Workspace<select aria-label="Switch internal workspace" value={current} onChange={e => { const item = items.find(w => w.id === e.target.value); if (item) router.push(item.href); }} style={{ width: "100%", minHeight: 42, background: "#14171d", color: "#eef1f6", border: "1px solid #3a4352", borderRadius: 8, padding: "8px 10px" }}>{!items.some(w => w.id === current) ? <option value={current}>{name}</option> : null}{items.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>;
}
