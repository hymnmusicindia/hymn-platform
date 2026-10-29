"use client";
import {ArrowUpRight,LoaderCircle} from "lucide-react";
import s from "./licence-toolbar.module.css";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LicenceCycleActions({ purchaseId }: { purchaseId: number }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function startRelease() {
    if (pending) return; setPending(true); setError("");
    try { const response = await fetch(`/api/beat-purchases/${purchaseId}/start-release`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not start release."); router.push(data.href); }
    catch (value) { setError(value instanceof Error ? value.message : "Could not start release."); setPending(false); }
  }
  return <div className={s.cycle}><button type="button" onClick={startRelease} disabled={pending} className={`${s.button} ${s.primary}`} aria-busy={pending}>{pending ? "Preparing release…" : "Start release"}{pending?<LoaderCircle size={16} aria-hidden="true"/>:<ArrowUpRight size={16} aria-hidden="true"/>}</button>{error ? <span role="alert" className={s.error}>{error}</span> : null}</div>;
}
