"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function JoinTeam({ authenticated }: { authenticated: boolean }) {
  const router = useRouter();
  const pending = useRef(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function invitationToken() {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (token) return token;
    try { return sessionStorage.getItem("hymn-team-invite"); } catch { return null; }
  }
  async function accept() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setMessage("");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      const token = invitationToken();
      if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new Error("Open the original invitation link from your email, then accept it here.");
      const response = await fetch("/api/team/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error((data?.error || "The team service could not confirm your invitation. Please try again.") + (data?.reference ? ` Reference: ${data.reference}` : ""));
      if (typeof data?.workspaceId !== "string") throw new Error("We could not confirm team access. Please try again.");
      try { sessionStorage.removeItem("hymn-team-invite"); } catch { /* Browser storage must not prevent a successful join. */ }
      window.location.replace("/team");
    } catch (error) {
      setMessage(controller.signal.aborted ? "This is taking longer than expected. Please try again; accepting twice will not create duplicate access." : error instanceof TypeError ? "Could not connect to HYMN. Check your connection and try again." : error instanceof Error ? error.message : "Could not accept invitation. Please try again.");
    } finally { clearTimeout(timeout); pending.current = false; setBusy(false); }
  }
  function signIn() {
    const token = invitationToken();
    try { if (token) sessionStorage.setItem("hymn-team-invite", token); }
    catch { setMessage("Enable browser storage to continue signing in, then reopen your invitation link."); return; }
    router.push("/login?next=/team/join");
  }
  return <main style={{ maxWidth: 600, margin: "12vh auto", padding: 24 }}>
    <h1>Join HYMN Team OS</h1>
    <p>Accept using the HYMN account whose email received this invitation. This grants internal workspace access, not platform administration.</p>
    <button className="btn-primary" disabled={busy} aria-busy={busy} onClick={authenticated ? accept : signIn}>{busy ? "Checking invitation…" : authenticated ? "Accept invitation" : "Sign in to accept"}</button>
    <p role="status" aria-live="polite">{message}</p>
    <p><Link href="/team">Open team workspace</Link></p>
    <Link href="/">Back to HYMN</Link>
  </main>;
}
