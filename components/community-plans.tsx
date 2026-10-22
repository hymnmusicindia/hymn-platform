"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowRight, AudioLines, Check, GraduationCap, Handshake, LoaderCircle, Megaphone, Mic2, Users } from "lucide-react";
import type { SupportTicket } from "@/lib/types";
import styles from "./community-plans.module.css";

const segments = [{ id: "promotion-playlists", label: "Playlist discovery" }, { id: "community-plans", label: "Community Plans" }, { id: "promotion-campaigns", label: "Campaign support" }];
const plans = [
  { name: "Campus", icon: GraduationCap, audience: "Societies & student clubs", description: "Build a music culture that lasts beyond one college fest.", benefits: ["Semester-based subscription proposals", "Group mixing & mastering rates", "Beat bundles for society projects", "Workshop & listening-session proposals"] },
  { name: "Cypher", icon: Mic2, audience: "Cyphers & open-mic crews", description: "Turn regular sessions into records worth putting out.", benefits: ["Session-based beat licensing bundles", "Bulk mixes for cypher recordings", "Recurring event & release planning", "Joint content and event branding"] },
  { name: "Collective", icon: Users, audience: "Artist networks & creative clubs", description: "Bring your artists together under one tailored arrangement.", benefits: ["Custom subscription and volume proposals", "Member service discounts", "Multi-project production packages", "A nominated community coordinator"] }
];

export function PromotionCommunityPage({ playlists, campaigns, onCreated }: { playlists: ReactNode; campaigns: ReactNode; onCreated: (ticket: SupportTicket) => void }) {
  const [active, setActive] = useState(segments[0].id);
  const [plan, setPlan] = useState("Cypher");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  function jump(id: string) {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    const url = new URL(window.location.href); url.hash = id; window.history.replaceState(null, "", url);
  }
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (segments.some(item => item.id === hash)) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: "-10% 0px -55% 0px", threshold: [0, .1, .5] });
    segments.forEach(item => { const section = document.getElementById(item.id); if (section) observer.observe(section); });
    return () => observer.disconnect();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const needs = data.getAll("needs").map(String);
    if (!needs.length) { setError("Choose at least one service for your community."); return; }
    const message = ["COMMUNITY PLAN APPLICATION", `Plan starting point: ${plan}`, `Community: ${String(data.get("community") || "").trim()}`, `City / institution: ${data.get("city")}`, `Active members: ${data.get("members")}`, `Community link: ${data.get("social")}`, `Services: ${needs.join(", ")}`, `Expected projects / frequency: ${data.get("volume")}`, `Budget: ${data.get("budget") || "To discuss"}`, `Goals: ${data.get("goals")}`, "Partnership intent: willing to agree HYMN branding, social mentions and periodic promotion; cadence and benefits to be agreed in a written proposal. No plan activated by this request."].join("\n");
    submitting.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/support-tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: `Community Plan - ${String(data.get("community")).trim()}`, category: "community_plan", priority: "normal", message }) });
      const result = await response.json();
      if (!response.ok || !result.ticket?.id) throw new Error(result.error || "Your request could not be saved. Please try again.");
      setTicketId(result.ticket.id); onCreated(result.ticket);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not connect. Your details are still here; please try again."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className={styles.page}>
    <header className={styles.header}><div><span className={styles.kicker}><Megaphone size={15}/> PROMOTION & PARTNERSHIPS</span><h1>Good music goes further together.</h1><p>Find your audience, build your community and plan your next move with HYMN.</p></div>
      <nav aria-label="Promotion sections">{segments.map(item => <a key={item.id} href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined} onClick={event => { event.preventDefault(); jump(item.id); }}>{item.label}<ArrowDown size={13}/></a>)}</nav>
    </header>
    <section id="promotion-playlists" className={styles.segment} aria-label="Playlist discovery">{playlists}</section>
    <section id="community-plans" className={`${styles.segment} ${styles.community}`} aria-labelledby="community-heading">
      <div className={styles.intro}><span className={styles.kicker}><Users size={16}/> COMMUNITY PLANS</span><h2 id="community-heading">Your community.<br/><span>More room to create.</span></h2><p>For societies, clubs, cypher crews and artist collectives. Get a tailored proposal for beats, mixing, mastering and subscriptions, with bulk deals built around what your members actually need.</p><a href="#community-application" onClick={event => { event.preventDefault(); formRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }}>Build our community plan <ArrowRight size={16}/></a></div>
      <div className={styles.plans}>{plans.map(item => <article key={item.name}><item.icon size={24}/><p className={styles.audience}>{item.audience}</p><h3>{item.name}</h3><p>{item.description}</p><ul>{item.benefits.map(benefit => <li key={benefit}><Check size={14}/>{benefit}</li>)}</ul><button type="button" onClick={() => { setPlan(item.name); formRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }}>Explore {item.name} <ArrowRight size={15}/></button></article>)}</div>
      <div className={styles.exchange}><div><Handshake size={23}/><h3>A simple exchange.</h3><p>We tailor access and pricing. Your community helps more artists discover HYMN.</p></div><ul><li><strong>Branding where it belongs</strong>Include agreed HYMN branding on supported event artwork, posts or release-related materials.</li><li><strong>Social mentions & regular shout-outs</strong>Tag HYMN and share agreed updates with your members at a cadence we decide together.</li><li><strong>One point of contact</strong>Nominate a coordinator to organise projects, member eligibility and partnership check-ins.</li></ul></div>
      <div className={styles.notes}><AudioLines size={21}/><p><strong>Built around real usage.</strong> We can discuss a semester pilot, a cypher series, pooled project bundles, workshops or a recurring release calendar. Your proposal confirms quantities, member access, validity, renewals, unused credits, delivery timelines and branding commitments. Beat rights always follow the selected licence.</p></div>
      {ticketId ? <div role="status" className={styles.success}><Check size={26}/><h3>Let&apos;s build this together.</h3><p>Your Community Plan request #{ticketId} is saved. HYMN will review your community and discuss a proposal. Track replies and add details in Support.</p><Link href="/dashboard?tab=support">View our request <ArrowRight size={16}/></Link></div> : <form ref={formRef} id="community-application" className={styles.form} onSubmit={submit} aria-busy={busy}>
        <div><span className={styles.kicker}>TELL US ABOUT YOUR PEOPLE</span><h3>Build your Community Plan.</h3><p>Custom pricing, agreed together. Submitting this form requests a proposal; it does not activate a subscription or charge you.</p></div>
        <fieldset disabled={busy}><legend className="sr-only">Community plan details</legend><div className={styles.fields}>
          <label>Plan starting point<select value={plan} onChange={event => setPlan(event.target.value)}>{plans.map(item => <option key={item.name}>{item.name}</option>)}</select></label>
          <label>Community / society name<input name="community" minLength={2} maxLength={120} required autoComplete="organization"/></label>
          <label>City / institution<input name="city" maxLength={160} required/></label>
          <label>Active members<input name="members" type="number" min={2} max={1000000} required/></label>
          <label className={styles.wide}>Community website / social profile<input name="social" type="url" placeholder="https://instagram.com/yourcommunity" maxLength={500} required/></label>
          <div className={styles.wide}><span>What would help your members?</span><div className={styles.checks}>{["Mixing / mastering", "Beats / licences", "Custom subscriptions", "Bulk project deals", "Workshops / events"].map(need => <label key={need}><input type="checkbox" name="needs" value={need}/>{need}</label>)}</div></div>
          <label>Expected projects & frequency<input name="volume" placeholder="e.g. one cypher every month, 6 mixes" maxLength={300} required/></label>
          <label>Budget range <small>optional</small><input name="budget" placeholder="Monthly, semester or project budget" maxLength={160}/></label>
          <label className={styles.wide}>What are you building?<textarea name="goals" placeholder="Tell us about your events, music and how you would introduce HYMN to your community." minLength={10} maxLength={2500} required/></label>
          <label className={`${styles.consent} ${styles.wide}`}><input type="checkbox" required/>We are open to agreed HYMN branding, social mentions and periodic promotion in exchange for a tailored community offer.</label>
        </div></fieldset>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? <><LoaderCircle size={16} className="animate-spin"/>Sending request...</> : <>Request our plan <ArrowRight size={16}/></>}</button>
      </form>}
      <details className={styles.faq}><summary>How are discounts and responsibilities decided?</summary><p>HYMN reviews your community size, expected projects and promotion commitments, then agrees the eligible services, prices, billing, term and deliverables with your coordinator. Discounts are activated only after approval. No fixed discount or unlimited usage is promised on this page.</p></details>
    </section>
    <section id="promotion-campaigns" className={styles.segment} aria-label="Campaign support">{campaigns}</section>
  </div>;
}
