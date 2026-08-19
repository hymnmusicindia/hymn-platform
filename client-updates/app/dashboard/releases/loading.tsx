export default function Loading() {
  return (
    <main className="shell py-10 sm:py-12 lg:py-14">
      <div className="grid gap-6 xl:gap-8">
        <section className="surface-card p-5 sm:p-6">
          <div className="space-y-4">
            <div className="h-4 w-32 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
            <div className="h-10 w-72 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
            <div className="h-5 w-96 max-w-full animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr,1fr] xl:grid-cols-[0.7fr,0.7fr,0.6fr]">
            <div className="h-14 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
            <div className="h-14 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
            <div className="h-14 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
          </div>
        </section>
        <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="w-full overflow-hidden rounded-xl border bg-[color-mix(in_srgb,var(--card)_96%,transparent)] md:max-w-[260px] md:justify-self-center" style={{ borderColor: "var(--border)" }}>
              <div className="aspect-square animate-pulse bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-24 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
                <div className="h-5 w-4/5 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
                <div className="h-4 w-3/5 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
                <div className="h-11 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--bg-soft)_80%,transparent)]" />
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
