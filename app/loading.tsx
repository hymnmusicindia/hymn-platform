export default function RootLoading() {
  return (
    <main className="fixed inset-0 z-[90] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg)_58%,transparent)] px-5 backdrop-blur-md" aria-live="polite" aria-busy="true">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-[color-mix(in_srgb,var(--text)_18%,transparent)] border-t-[var(--accent)]" aria-hidden="true" />
        <p className="mt-5 text-sm font-semibold">Loading your HYMN workspace…</p>
        <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>This should only take a moment.</p>
      </div>
    </main>
  );
}
// vercel trigger 5
// vercel trigger 6
