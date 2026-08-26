"use client";

import { useRouter } from "next/navigation";
import type { Beat } from "@/lib/types";

export function BeatLicenseChoices({ beat }: { beat: Beat }) {
  const router = useRouter();
  const sold = beat.status === "EXCLUSIVELY_SOLD";
  const reserved = beat.status === "EXCLUSIVE_RESERVED" && (!beat.exclusiveReservationExpiresAt || new Date(beat.exclusiveReservationExpiresAt).getTime() > Date.now());
  function choose(licenseType: "general" | "exclusive") {
    window.localStorage.setItem("hymn-beat-cart", JSON.stringify([{ beatId: beat.id, licenseType }]));
    window.dispatchEvent(new CustomEvent("hymn-cart-updated", { detail: { count: 1 } }));
    router.push("/checkout?product=beatstore");
  }
  return <div className="mt-7 grid gap-3 sm:grid-cols-2">
    <article className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-xs font-semibold uppercase tracking-[.15em] text-[var(--text-soft)]">General Licence</p><p className="mt-2 text-2xl font-semibold">₹{(beat.generalPrice ?? beat.price).toLocaleString("en-IN")}</p><p className="mt-2 text-sm text-[var(--text-muted)]">Commercial use for up to {beat.generalMaxCommercialReleases ?? 1} release{(beat.generalMaxCommercialReleases ?? 1) === 1 ? "" : "s"}. Other buyers may also license this beat.</p><button type="button" disabled={sold || reserved} onClick={() => choose("general")} className="btn-primary mt-4 w-full">{sold ? "Sold" : reserved ? "Temporarily reserved" : "Choose General"}</button></article>
    <article className="rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-xs font-semibold uppercase tracking-[.15em] text-[var(--text-soft)]">Exclusive Licence</p><p className="mt-2 text-2xl font-semibold">₹{(beat.exclusivePrice ?? 0).toLocaleString("en-IN")}</p><p className="mt-2 text-sm text-[var(--text-muted)]">Exclusive rights to use this beat. Copyright remains with the producer unless a written rights assignment explicitly applies.</p><button type="button" disabled={sold || reserved} onClick={() => choose("exclusive")} className="btn-primary mt-4 w-full">{sold ? "Sold" : reserved ? "Temporarily reserved" : "Choose Exclusive"}</button></article>
  </div>;
}
