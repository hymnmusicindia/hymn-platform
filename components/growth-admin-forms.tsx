"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function GrowthAdminForm({ kind, campaignId, lead }: { kind: "campaign" | "spend" | "lead"; campaignId?: number; lead?: { id: number; status: string; notes: string; assignedTo: number | null } }) {
  const router = useRouter();
  const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    const payload = kind === "campaign" ? { ...values, budgetCents: Math.round(Number(values.budget) * 100) } : kind === "spend" ? { action: "spend", id: crypto.randomUUID(), campaignId, amountCents: Math.round(Number(values.amount) * 100), spentAt: new Date(String(values.date)).toISOString(), note: values.note } : { ...values, id: lead?.id, assignedTo: values.assignedTo ? Number(values.assignedTo) : null };
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/growth/${kind === "lead" ? "leads" : "campaigns"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save.");
      setMessage("Saved."); if (kind !== "lead") form.reset(); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); } finally { setPending(false); }
  }
  const field = (name: string, label: string, type = "text", initial = "") => <label className="grid gap-2 text-sm" key={name}>{label}<input className="field" name={name} type={type} defaultValue={initial} required={!["content", "notes", "assignedTo"].includes(name)} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} /></label>;
  return <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    {kind === "campaign" && <>{field("name", "Name")}{field("slug", "Unique campaign slug")}{field("channel", "Channel")}{field("source", "UTM source")}{field("medium", "UTM medium")}{field("content", "UTM content")}{field("budget", "Budget (INR)", "number", "3000")}<label className="grid gap-2 text-sm">Landing page<select className="field" name="landingPage" defaultValue="/first-release-free">{["/first-release-free", "/distribution", "/contact", "/partnership-program", "/"].map(path => <option key={path}>{path}</option>)}</select></label><label className="grid gap-2 text-sm">Status<select className="field" name="status">{["draft", "active", "paused", "completed"].map(status => <option key={status}>{status}</option>)}</select></label>{field("notes", "Hypothesis, creator, primary metric and decision")}</>}
    {kind === "spend" && <>{field("amount", "Spend (INR)", "number")}{field("date", "Date", "date")}{field("note", "Spend description")}</>}
    {kind === "lead" && <><label className="grid gap-2 text-sm">Status<select className="field" name="status" defaultValue={lead?.status}>{["new", "contacted", "qualified", "converted", "closed"].map(status => <option key={status}>{status}</option>)}</select></label>{field("assignedTo", "Assigned admin user ID (optional)", "number", String(lead?.assignedTo || ""))}<label className="grid gap-2 text-sm sm:col-span-2">Internal notes<textarea name="notes" className="field" defaultValue={lead?.notes} maxLength={5000} /></label></>}
    <button className="btn-primary w-fit" disabled={pending}>{pending ? "Saving…" : "Save"}</button><p role="status" className="text-sm">{message}</p>
  </form>;
}

export function CopyCampaignLink({ url }: { url: string }) {
  const [message, setMessage] = useState("Copy link");
  return <button className="btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("Copied"); } catch { setMessage("Select and copy the link below"); } }}>{message}</button>;
}
