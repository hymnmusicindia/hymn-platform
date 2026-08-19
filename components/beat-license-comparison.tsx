import { Check, Minus } from "lucide-react";
import { beatLicenseCatalog } from "@/lib/beat-store";

export function BeatLicenseComparison() {
  return (
    <section className="surface-card overflow-hidden p-5 sm:p-7" aria-labelledby="license-comparison-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">Rights, before payment</p>
          <h2 id="license-comparison-title" className="mt-2 text-2xl font-semibold text-[var(--text)]">Compare licenses</h2>
        </div>
        <p className="max-w-md text-sm text-[var(--text-soft)]">Basic and Exclusive are available now. Additional delivery tiers are being prepared for verified file delivery.</p>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
          <thead><tr><th className="border-b border-[var(--border)] p-3 text-[var(--text-soft)]">License</th><th className="border-b border-[var(--border)] p-3">Files</th><th className="border-b border-[var(--border)] p-3">Streams</th><th className="border-b border-[var(--border)] p-3">Distribution</th><th className="border-b border-[var(--border)] p-3">Monetization</th><th className="border-b border-[var(--border)] p-3">Stems</th><th className="border-b border-[var(--border)] p-3">Availability</th></tr></thead>
          <tbody>{beatLicenseCatalog.map((tier) => <tr key={tier.id} className="text-[var(--text-soft)]"><th className="border-b border-[var(--border)] p-3 font-semibold text-[var(--text)]">{tier.title}<span className="mt-1 block text-xs font-normal text-[var(--text-soft)]">{tier.bestFor}</span></th><td className="border-b border-[var(--border)] p-3">{tier.delivery}</td><td className="border-b border-[var(--border)] p-3">{tier.streamLimit}</td><td className="border-b border-[var(--border)] p-3">{tier.distributionAllowed ? <Check className="h-4 w-4 text-emerald-500" /> : <Minus className="h-4 w-4" />}</td><td className="border-b border-[var(--border)] p-3">{tier.monetizationAllowed ? <Check className="h-4 w-4 text-emerald-500" /> : <Minus className="h-4 w-4" />}</td><td className="border-b border-[var(--border)] p-3">{tier.includesStems ? <Check className="h-4 w-4 text-emerald-500" /> : <Minus className="h-4 w-4" />}</td><td className="border-b border-[var(--border)] p-3"><span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold">{tier.purchasableKey ? "Available" : "Coming soon"}</span></td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-5 text-xs leading-5 text-[var(--text-soft)]">Non-exclusive licenses keep the beat available to other buyers. Content ID and stems are permitted only where the selected license explicitly includes them.</p>
    </section>
  );
}

// vercel trigger 3
