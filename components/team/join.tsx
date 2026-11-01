"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleAlert, LoaderCircle, LockKeyhole, MessageCircle, CalendarDays, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import styles from "./join.module.css";

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
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="HYMN Music home">HYMN<span>TEAM OS</span></Link>
      <ThemeToggle />
    </header>
    <div className={styles.layout}>
      <section className={styles.intro} aria-label="Your team workspace">
        <span className={styles.eyebrow}>GOOD WORK STARTS TOGETHER</span>
        <h2>One team.<br />One place to move forward.</h2>
        <p>Your next chapter with HYMN starts with a shared space for the work that matters.</p>
        <ul className={styles.features}>
          <li><Users size={19} aria-hidden="true" /><span><strong>Know your next step</strong><small>Your tasks, priorities and projects, together.</small></span></li>
          <li><MessageCircle size={19} aria-hidden="true" /><span><strong>Stay in the conversation</strong><small>Keep your team and work updates close.</small></span></li>
          <li><CalendarDays size={19} aria-hidden="true" /><span><strong>Make room for good work</strong><small>See your schedule and upcoming calls.</small></span></li>
        </ul>
      </section>
      <section className={styles.card} aria-labelledby="join-team-title" aria-busy={busy}>
        <div className={styles.inviteIcon}><Users size={26} aria-hidden="true" /></div>
        <span className={styles.eyebrow}>YOU’RE INVITED</span>
        <h1 id="join-team-title">Join HYMN Team OS</h1>
        <p className={styles.description}>A place for your team, your projects and what comes next.</p>
        <ol className={styles.steps} aria-label="Joining steps">
          <li aria-current={!authenticated ? "step" : undefined}><span>{authenticated ? <Check size={14} aria-hidden="true" /> : "1"}</span>Sign in{authenticated ? <small>Done</small> : null}</li>
          <li aria-current={authenticated ? "step" : undefined}><span>2</span>Join workspace</li>
        </ol>
        <div className={styles.accountNote}><LockKeyhole size={18} aria-hidden="true" /><p>Use the HYMN account with the email address that received this invitation.</p></div>
        {message ? <div className={styles.error} role="alert" id="join-team-error"><CircleAlert size={19} aria-hidden="true" /><div><strong>{authenticated ? "We couldn’t join just yet" : "Let’s get you signed in"}</strong><p>{message}</p></div></div> : null}
        <button className={styles.accept} type="button" disabled={busy} aria-busy={busy} aria-describedby={message ? "join-team-error" : undefined} onClick={authenticated ? accept : signIn}>
          {busy ? <LoaderCircle className={styles.spinner} size={18} aria-hidden="true" /> : null}
          {busy ? "Checking invitation…" : message ? authenticated ? "Try again" : "Try signing in again" : authenticated ? "Accept invitation" : "Sign in to accept"}
          {!busy ? <ArrowRight size={18} aria-hidden="true" /> : null}
        </button>
        <p className={styles.pending} role="status" aria-live="polite">{busy ? "Confirming your invitation. This may take a moment." : "Your workspace owner manages your team permissions."}</p>
        <div className={styles.existing}><span>Already part of the team?</span><Link href="/team">Open team workspace <ArrowRight size={15} aria-hidden="true" /></Link></div>
      </section>
    </div>
    <footer className={styles.footer}><Link href="/"><ArrowLeft size={15} aria-hidden="true" />Back to HYMN</Link><span>Need a new invitation? Contact your workspace owner.</span></footer>
  </main>;
}
