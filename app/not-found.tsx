import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[55vh] max-w-7xl items-center justify-center px-5 py-16">
      <section className="surface-card w-full max-w-lg p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>404</p>
        <h1 className="mt-3 text-2xl font-semibold">This page isn’t available</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>The link may be outdated, or you may not have access to this workspace.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link className="btn-primary pressable" href="/dashboard">Open dashboard</Link>
          <Link className="btn-outline pressable" href="/help">Get help</Link>
        </div>
      </section>
    </main>
  );
}
// vercel trigger 5
