"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GoogleAuthButton } from "@/components/google-auth-button";

export function AdminLoginForm() {
  return (
    <section className="auth-minimal mx-auto flex min-h-[70svh] w-full max-w-xl flex-col justify-center px-1 py-10 sm:px-6">
      <Link href="/" className="mb-14 inline-flex w-fit items-center gap-2 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)]">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <p className="text-[10px] font-bold uppercase tracking-[.24em] text-[var(--accent)]">Restricted access</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-.045em] text-[var(--text)] sm:text-5xl">HYMN Admin.</h1>
      <p className="mt-4 text-sm text-[var(--text-muted)]">Approved administrators only.</p>

      <div className="mt-10 border-t border-[var(--border)] pt-8">
        <GoogleAuthButton label="Continue with Google" className="w-full" loginContext="admin" appearance="quiet" />
      </div>
    </section>
  );
}

// vercel trigger 12
