"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
export function JoinTeam({ authenticated }: { authenticated: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    try {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token") || sessionStorage.getItem("hymn-team-invite");
      const response = await fetch("/api/team/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); const data = await response.json();
      if (!response.ok) throw new Error(data.error); sessionStorage.removeItem("hymn-team-invite"); window.location.replace("/team");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not accept invitation."); } finally { setBusy(false); }
  }
  function signIn() { const token = new URLSearchParams(location.hash.slice(1)).get("token"); if (token) sessionStorage.setItem("hymn-team-invite", token); router.push("/login?next=/team/join"); }
  return <main style={{ maxWidth: 600, margin: "12vh auto", padding: 24 }}><h1>Join HYMN Team OS</h1><p>Accept using the HYMN account whose email received this invitation. This grants internal workspace access, not platform administration.</p><button className="btn-primary" disabled={busy} onClick={authenticated ? accept : signIn}>{busy ? "Checking invitation…" : authenticated ? "Accept invitation" : "Sign in to accept"}</button><p role="status">{message}</p><Link href="/">Back to HYMN</Link></main>;
}
