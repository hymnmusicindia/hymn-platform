import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="shell py-16">
      <section className="surface-card mx-auto max-w-3xl p-10 text-center">
        <h1 className="text-4xl font-semibold" style={{ color: "var(--text)" }}>
          This workspace is reserved for another HYMN role.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl" style={{ color: "var(--text-muted)" }}>
          Your account is authenticated, but it does not have permission for this dashboard or action.
        </p>
        <Link href="/login" className="btn-primary pressable mt-8 inline-flex">
          Continue with Google
        </Link>
      </section>
    </main>
  );
}

// vercel trigger 2
