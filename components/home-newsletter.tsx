"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Check, Mail, Sparkles } from "lucide-react";

export function HomeNewsletter({ accountEmail }: { accountEmail?: string | null }) {
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [useDifferentEmail, setUseDifferentEmail] = useState(!accountEmail);
  const [subscription, setSubscription] = useState<{ email: string; token: string } | null>(null);
  const [checking, setChecking] = useState(Boolean(accountEmail));
  const [checkFailed, setCheckFailed] = useState(false);
  const [checkVersion, setCheckVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSubscription(null);
    setUseDifferentEmail(!accountEmail);
    setCheckFailed(false);
    setMessage(null);
    if (!accountEmail) { setChecking(false); return; }
    setChecking(true);
    void fetch("/api/newsletter/subscribe", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check your subscription.");
        if (!controller.signal.aborted) setSubscription(data.subscription);
      })
      .catch(error => {
        if (!controller.signal.aborted) { setCheckFailed(true); setMessage(error instanceof Error ? error.message : "Could not check your subscription."); }
      })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [accountEmail, checkVersion]);

  useEffect(() => {
    const refresh = () => { if (accountEmail && !sending && !useDifferentEmail) setCheckVersion(value => value + 1); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [accountEmail, sending, useDifferentEmail]);

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || checking || checkFailed) return;
    const form = event.currentTarget;
    const email = useDifferentEmail
      ? String(new FormData(form).get("email") || "").trim()
      : accountEmail?.trim() || "";
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not subscribe.");
      setSubscription({ email, token: data.unsubscribeToken });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not subscribe.");
    } finally {
      setSending(false);
    }
  }

  async function unsubscribe() {
    if (!subscription) return;
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/newsletter/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: subscription.token })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not unsubscribe.");
      const email = subscription.email;
      setSubscription(null);
      setMessage(`${email} has been unsubscribed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not unsubscribe.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={subscribe} className="w-full max-w-lg">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.025))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_20px_55px_rgba(0,0,0,.22)] sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/[0.06] blur-3xl" />
        {checking ? <p className="relative text-sm text-white/70" role="status">Checking your subscription…</p> : checkFailed ? <button type="button" onClick={() => setCheckVersion(value => value + 1)} className="relative text-sm text-white underline underline-offset-4">Retry subscription check</button> : subscription ? (
          <div className="relative">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-black"><Check className="h-5 w-5" strokeWidth={2.5} /></span>
              <div className="min-w-0">
                <p className="text-base font-semibold text-white">Subscribed</p>
                <p className="mt-1 text-sm leading-6 text-white/60">HYMN updates will go to</p>
                <p className="truncate text-sm font-medium text-white">{subscription.email}</p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
              <span className="flex items-center gap-2 text-[11px] text-white/45"><Sparkles className="h-3.5 w-3.5" /> Releases, offers and artist news</span>
              <button type="button" onClick={unsubscribe} disabled={sending} className="shrink-0 text-xs font-medium text-white/60 underline decoration-white/25 underline-offset-4 transition hover:text-white disabled:opacity-50">{sending ? "Unsubscribing…" : "Unsubscribe"}</button>
            </div>
          </div>
        ) : accountEmail && !useDifferentEmail ? (
          <div className="relative">
            <div className="flex items-start gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-white"><Mail className="h-5 w-5" /></span>
              <div className="min-w-0"><p className="text-base font-semibold text-white">Stay in the HYMN loop?</p><p className="mt-1 text-sm leading-6 text-white/60">Release insights, platform updates and artist opportunities.</p></div>
            </div>
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3"><span className="h-2 w-2 shrink-0 rounded-full bg-[#62d99a] shadow-[0_0_12px_rgba(98,217,154,.55)]" /><span className="min-w-0 flex-1 truncate text-sm text-white/80">{accountEmail}</span><Check className="h-4 w-4 shrink-0 text-white/45" /></div>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <button type="submit" disabled={sending} className="group inline-flex items-center gap-3 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#111] transition hover:-translate-y-0.5 hover:bg-white/90 disabled:translate-y-0 disabled:opacity-60">{sending ? "Subscribing…" : "Yes, subscribe"}{!sending ? <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /> : null}</button>
              <button type="button" onClick={() => { setUseDifferentEmail(true); setMessage(null); }} className="text-xs font-medium text-white/60 underline decoration-white/25 underline-offset-4 transition hover:text-white">Use a different email?</button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div className="mb-4 flex items-center justify-between gap-4"><div><p className="text-base font-semibold text-white">Choose your newsletter email</p><p className="mt-1 text-xs text-white/50">You can unsubscribe whenever you want.</p></div>{accountEmail ? <button type="button" onClick={() => { setUseDifferentEmail(false); setMessage(null); }} className="shrink-0 text-xs font-medium text-white/60 underline decoration-white/25 underline-offset-4 hover:text-white">Use Google email</button> : null}</div>
            <div className="flex overflow-hidden rounded-xl border border-white/15 bg-white shadow-[0_8px_24px_rgba(0,0,0,.18)] focus-within:ring-2 focus-within:ring-white/25">
              <label className="sr-only" htmlFor="home-newsletter-email">Email address</label>
              <input id="home-newsletter-email" name="email" type="email" required autoFocus={Boolean(accountEmail)} defaultValue={accountEmail || ""} placeholder="Enter your email" className="min-w-0 flex-1 border-0 bg-white px-4 py-3.5 text-sm text-[#131313] outline-none placeholder:text-[#777]" />
              <button type="submit" disabled={sending} className="shrink-0 border-l border-black/10 bg-[#f1f3f6] px-5 py-3.5 text-sm font-semibold text-[#131313] transition hover:bg-[#e6e9ee] disabled:opacity-60">{sending ? "Subscribing…" : "Subscribe"}</button>
            </div>
          </div>
        )}
      </div>
      {message ? <p className="mt-3 text-xs leading-5 text-white/65" aria-live="polite">{message}</p> : null}
    </form>
  );
}
