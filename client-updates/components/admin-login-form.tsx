"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    startTransition(async () => {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Admin authentication failed.");
        return;
      }

      router.push(data.redirectPath ?? "/admin");
      router.refresh();
    });
  }

  return (
    <section className="surface-card mx-auto max-w-xl p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">Admin access</span>
          <h1 className="mt-4 text-4xl font-semibold" style={{ color: "var(--text)" }}>
            HYMN admin login
          </h1>
          <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
            Use the temporary local admin credentials for this workspace.
          </p>
        </div>
        <Link href="/" className="inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
          Back to site
        </Link>
      </div>

      <form onSubmit={onSubmit} className="mt-8 grid gap-5">
        <label className="grid gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
          Username
          <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>

        <label className="grid gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
          Password
          <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>

        {error ? <p className="text-sm font-semibold text-red-400">{error}</p> : null}

        <button type="submit" disabled={isPending} className="btn-primary pressable disabled:cursor-not-allowed disabled:opacity-60">
          {isPending ? "Signing in..." : "Open admin portal"}
        </button>
      </form>
    </section>
  );
}
