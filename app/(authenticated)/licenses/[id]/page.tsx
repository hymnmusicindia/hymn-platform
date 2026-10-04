import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUserForPage } from "@/lib/access";
import { getBeatLicenceAgreement } from "@/lib/beat-license";
import { LicenceCycleActions } from "@/components/licence-cycle-actions";

export default async function BeatLicencePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserForPage();
  if (!user) redirect("/login");
  const purchaseId = Number((await params).id);
  if (!Number.isInteger(purchaseId) || purchaseId < 1) notFound();
  let licence;
  try { licence = await getBeatLicenceAgreement(purchaseId, user.id, user.role === "admin"); } catch { notFound(); }

  return <main className="min-h-screen bg-[#e9e7e1] px-3 py-6 text-[#17181b] sm:px-6 sm:py-10">
    <div className="mx-auto mb-4 flex max-w-[920px] flex-wrap items-center justify-between gap-3 print:hidden">
      <Link href="/dashboard?tab=purchases" className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold">← Purchases</Link>
      <div className="flex flex-wrap gap-2">
        {licence.studioOrder ? <Link href={`/studio/orders/${licence.studioOrder.publicId}`} className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold">Open Studio project</Link> : <Link href="/studio" className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold">Mix &amp; master</Link>}
        {licence.releaseId ? <Link href={`/distribution/start?draft=${licence.releaseId}`} className="rounded-full border border-black bg-black px-4 py-2 text-sm font-semibold text-white">Continue release</Link> : <LicenceCycleActions purchaseId={licence.purchaseId} />}
        {licence.pdfUrl ? <a href={licence.pdfUrl} download className="rounded-full border border-black bg-white px-4 py-2 text-sm font-semibold">Download PDF</a> : null}
      </div>
    </div>

    <article className="mx-auto max-w-[920px] overflow-hidden rounded-[28px] bg-[#fbfaf7] shadow-[0_28px_90px_rgba(20,20,20,.16)] print:rounded-none print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-8 bg-[#0c0e12] px-7 py-8 text-white sm:px-12 sm:py-11">
        <Image src="/assets/hymnlogowhite.png" alt="HYMN Music" width={142} height={47} priority className="h-auto w-[126px] sm:w-[142px]" />
        <div className="text-left sm:text-right"><p className="text-[10px] font-bold uppercase tracking-[.22em] text-white/55">Beat licence agreement</p><p className="mt-2 font-mono text-xs text-white/75">{licence.licenceNumber}</p></div>
      </header>

      <div className="px-7 py-9 sm:px-12 sm:py-12">
        <div className="border-b border-black/10 pb-9"><span className={`inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] ${licence.exclusive ? "bg-[#d9c9ff] text-[#392170]" : "bg-[#d7f5e8] text-[#164f39]"}`}>{licence.exclusive ? "Exclusive" : "General licence"}</span><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] sm:text-5xl">{licence.licenceLabel}</h1><p className="mt-3 text-lg text-black/55">For “{licence.beatTitle}”</p></div>

        <section className="grid gap-x-10 gap-y-6 border-b border-black/10 py-9 sm:grid-cols-2">
          {[["Licensee · legal name", licence.buyerLegalName], ["Artist name", licence.artistName], ["Licensor · producer", licence.producerName], ["Issued", new Date(licence.purchasedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })], ["Purchase", licence.price], ["Agreement version", licence.version]].map(([label, value]) => <div key={label}><p className="text-[10px] font-bold uppercase tracking-[.16em] text-black/40">{label}</p><p className="mt-1.5 font-semibold">{value}</p></div>)}
        </section>

        <section className="py-9"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-black/40">Rights summary</p><div className="mt-5 grid overflow-hidden rounded-2xl border border-black/10 sm:grid-cols-2">{licence.rights.map((right) => <div key={right.label} className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(odd)]:border-r"><span className="text-sm text-black/50">{right.label}</span><strong className="text-right text-sm">{right.value}</strong></div>)}</div></section>

        <section className="border-t border-black/10 pt-9"><div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-black/40">Agreement terms</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">What this licence permits</h2></div><span className="font-mono text-[10px] text-black/35">{licence.licenceNumber}</span></div><ol className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">{licence.clauses.map((clause, index) => <li key={clause.title} className="relative pl-9"><span className="absolute left-0 top-0 font-mono text-xs font-bold text-black/35">{String(index + 1).padStart(2, "0")}</span><h3 className="font-semibold">{clause.title}</h3><p className="mt-2 text-sm leading-6 text-black/60">{clause.body}</p></li>)}</ol></section>

        <footer className="mt-12 flex flex-wrap items-end justify-between gap-6 border-t border-black/15 pt-7"><div><p className="text-sm font-semibold">Electronically issued by HYMN Music</p><p className="mt-1 max-w-xl text-xs leading-5 text-black/45">Keep this agreement with its purchase, studio project, and distribution records. The versioned purchase snapshot remains the controlling electronic record.</p></div><div className="text-right font-mono text-[10px] text-black/40"><p>Purchase #{licence.purchaseId}</p><p>{licence.buyerEmail}</p></div></footer>
      </div>
    </article>
  </main>;
}
