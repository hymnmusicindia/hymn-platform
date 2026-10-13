"use client";
import Link from "next/link";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LicenceCycleActions({ purchaseId }: { purchaseId: number }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function startRelease() {
    if (pending) return; setPending(true); setError("");
    try { const response = await fetch(`/api/beat-purchases/${purchaseId}/start-release`, { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not start release."); router.push(data.href); }
    catch (value) { setError(value instanceof Error ? value.message : "Could not start release."); setPending(false); }
  }
  return <div className="flex flex-col items-end gap-1"><Link href={`/studio?beatPurchaseId=${purchaseId}`} className="btn-outline text-xs">Find a mix engineer</Link><Link href={`/studio/readiness?beatPurchaseId=${purchaseId}`} className="text-xs underline">Free readiness check</Link><button type="button" onClick={startRelease} disabled={pending} className="rounded-full border border-black bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Preparing release…" : "Master ready · start release"}</button>{error ? <span role="alert" className="max-w-56 text-right text-xs text-red-700">{error}</span> : null}</div>;
}
