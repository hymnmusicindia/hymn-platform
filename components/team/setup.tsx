"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function TeamSetup() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const router = useRouter();
  return <section><h2>Founder setup</h2><p>If this is HYMN’s first Team OS launch, the explicitly configured founder can initialise the workspace. Other accounts must be invited.</p><button disabled={busy} onClick={async () => { if (!confirm("Initialise HYMN Team OS with your signed-in founder account?")) return; setBusy(true); try { const response = await fetch("/api/team/setup", { method: "POST" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Setup failed."); } finally { setBusy(false); } }}>{busy ? "Initialising…" : "Initialise Team OS"}</button><p role="status">{error}</p></section>;
}
