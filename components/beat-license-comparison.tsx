import { Check, Minus } from "lucide-react";
import { beatLicenseCatalog } from "@/lib/beat-store";

export function BeatLicenseComparison() {
  return (
    <section className="beat-license-comparison border-y border-[var(--border)] py-8 sm:py-10" aria-labelledby="license-comparison-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Rights, before payment</p>
          <h2 id="license-comparison-title" className="mt-2 text-2xl font-semibold text-[var(--text)]">Compare licenses</h2>
        </div>
        <p className="max-w-md text-sm text-[var(--text-soft)]">Choose an affordable General Licence or secure exclusive rights to use the beat.</p>
      </div>
      <div className="mt-4 grid gap-3 sm:hidden">
        {beatLicenseCatalog.map((tier) => (
          <article key={`mobile-${tier.id}`} className="border-b border-[var(--border)] py-4 last:border-0">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-[var(--text)]">{tier.title}</h3><p className="mt-1 text-xs text-[var(--text-soft)]">{tier.bestFor}</p></div><span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-semibold">{tier.purchasableKey ? "Available" : "Coming soon"}</span></div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-[var(--text-soft)]">Files</dt><dd className="mt-1 font-semibold">{tier.delivery}</dd></div><div><dt className="text-[var(--text-soft)]">Streams</dt><dd className="mt-1 font-semibold">{tier.streamLimit}</dd></div></dl>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">{[["Distribution", tier.distributionAllowed], ["Monetization", tier.monetizationAllowed], ["Stems", tier.includesStems]].map(([label, enabled]) => <span key={String(label)} className="inline-flex items-center gap-1 rounded-full border px-2 py-1" style={{ borderColor: "var(--border)", color: enabled ? "var(--success)" : "var(--text-soft)" }}>{enabled ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}{label}</span>)}</div>
          </article>
        ))}
      </div>
      <div className="mt-6 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
          <thead><tr><th className="border-b border-[var(--border)] p-3 text-[var(--text-soft)]">License</th><th className="border-b border-[var(--border)] p-3">Files</th><th className="border-b border-[var(--border)] p-3">Streams</th><th className="border-b border-[var(--border)] p-3">Distribution</th><th className="border-b border-[var(--border)] p-3">Monetization</th><th className="border-b border-[var(--border)] p-3">Stems</th><th className="border-b border-[var(--border)] p-3">Availability</th></tr></thead>
          <tbody>{beatLicenseCatalog.map((tier) => <tr key={tier.id} className="text-[var(--text-soft)]"><th className="border-b border-[var(--border)] p-3 font-semibold text-[var(--text)]">{tier.title}<span className="mt-1 block text-xs font-normal text-[var(--text-soft)]">{tier.bestFor}</span></th><td className="border-b border-[var(--border)] p-3">{tier.delivery}</td><td className="border-b border-[var(--border)] p-3">{tier.streamLimit}</td><td className="border-b border-[var(--border)] p-3">{tier.distributionAllowed ? <Check className="h-4 w-4 text-emerald-500" /> : <Minus className="h-4 w-4" />}</td><td className="border-b border-[var(--border)] p-3">{tier.monetizationAllowed ? <Check className="h-4 w-4 text-emerald-500" /> : <Minus className="h-4 w-4" />}</td><td className="border-b border-[var(--border)] p-3">{tier.includesStems ? <Check className="h-4 w-4 text-emerald-500" /> : <Minus className="h-4 w-4" />}</td><td className="border-b border-[var(--border)] p-3"><span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold">{tier.purchasableKey ? "Available" : "Coming soon"}</span></td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-5 text-xs leading-5 text-[var(--text-soft)]">General licences keep the beat available to other buyers. Exclusive licences grant exclusive use rights; copyright assignment applies only when the agreement explicitly says so.</p>
    </section>
  );
}

// vercel trigger 3

// vercel trigger 12
