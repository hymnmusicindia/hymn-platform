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
  const label = sold ? "Sold" : reserved ? "Temporarily reserved" : null;
  return <div className="beat-license-options mt-7 grid sm:grid-cols-2">
    <article className="beat-license-option py-1 sm:pr-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[var(--text-soft)]">General Licence</p><p className="mt-1.5 text-2xl font-semibold">₹{(beat.generalPrice ?? beat.price).toLocaleString("en-IN")}</p></div><span className="text-xs text-[var(--text-soft)]">Non-exclusive</span></div><p className="mt-2 min-h-10 text-sm leading-5 text-[var(--text-muted)]">Commercial use for up to {beat.generalMaxCommercialReleases ?? 1} release{(beat.generalMaxCommercialReleases ?? 1) === 1 ? "" : "s"}. Other buyers may license it too.</p><button type="button" disabled={sold || reserved} onClick={() => choose("general")} className="beat-license-button mt-4 w-full">{label || "Choose General"}</button></article>
    <article className="beat-license-option mt-6 border-t border-[var(--border)] pt-6 sm:mt-0 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-1"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[var(--text-soft)]">Exclusive Licence</p><p className="mt-1.5 text-2xl font-semibold">₹{(beat.exclusivePrice ?? 0).toLocaleString("en-IN")}</p></div><span className="text-xs text-[var(--text-soft)]">One buyer</span></div><p className="mt-2 min-h-10 text-sm leading-5 text-[var(--text-muted)]">Exclusive use rights. Copyright remains with the producer unless the written agreement says otherwise.</p><button type="button" disabled={sold || reserved} onClick={() => choose("exclusive")} className="beat-license-button mt-4 w-full">{label || "Choose Exclusive"}</button></article>
  </div>;
}
