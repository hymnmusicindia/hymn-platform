"use client";

import Link from "next/link";
import { useState } from "react";

export function ClaimContributorForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  async function claim() {
    setState("loading");
    const response = await fetch("/api/contributors/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setState("error"); setMessage(body.error || "Could not claim this contributor identity."); return; }
    setState("success"); setMessage(`Claimed ${body.contributor.professionalName} (${body.contributor.publicId}). Historical credits remain linked to this identity.`);
  }
  return <>{!token ? <p className="mt-6 text-sm text-red-300">The invitation token is missing.</p> : state !== "success" ? <button type="button" className="btn-primary mt-6" disabled={state === "loading"} onClick={claim}>{state === "loading" ? "Verifying…" : "Verify and claim identity"}</button> : null}{message ? <p className="mt-5 text-sm" aria-live="polite">{message}</p> : null}{state === "success" ? <Link href="/producer/dashboard" className="btn-outline mt-6 inline-flex">Open producer dashboard</Link> : null}</>;
}
