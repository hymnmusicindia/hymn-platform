"use client";

import { useEffect } from "react";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("HYMN route error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[55vh] max-w-7xl items-center justify-center px-5 py-16">
      <section className="surface-card w-full max-w-lg p-8 text-center" role="alert">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>Workspace error</p>
        <h1 className="mt-3 text-2xl font-semibold">We couldn’t load this page</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Your data is safe. Try loading the page again, or contact HYMN support if the issue continues.</p>
        {error.digest ? <p className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>Reference: {error.digest}</p> : null}
        <button type="button" className="btn-primary pressable mt-6" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
// vercel trigger 5
