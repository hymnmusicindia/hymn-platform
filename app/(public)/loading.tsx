export default function PublicLoading() {
  return <main className="grid min-h-[60vh] place-items-center bg-[var(--bg)] text-[var(--text)]" aria-busy="true" aria-live="polite">
    <div className="flex items-center gap-3 text-sm">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--text)] motion-reduce:animate-none" aria-hidden="true" />
      Loading page…
    </div>
  </main>;
}
