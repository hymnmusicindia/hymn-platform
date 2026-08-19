"use client";

import Link from "next/link";
import { ArrowLeft, Command, KeyRound, LockKeyhole, ServerCog, ShieldCheck } from "lucide-react";
import { GoogleAuthButton } from "@/components/google-auth-button";

export function AdminLoginForm() {
  return (
    <section className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] border shadow-[0_34px_130px_rgba(0,0,0,0.32)]" style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, #070a10, var(--card))" }}>
      <div className="pointer-events-none absolute inset-0 opacity-80" style={{ background: "radial-gradient(circle at 18% 18%, rgba(89,223,224,0.16), transparent 28%), radial-gradient(circle at 78% 12%, rgba(125,183,255,0.12), transparent 24%), linear-gradient(135deg, rgba(255,255,255,0.06), transparent 50%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.42)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.42)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative grid min-h-[640px] lg:grid-cols-[0.95fr,1.05fr]">
        <div className="flex flex-col justify-between gap-10 p-6 text-white sm:p-8 lg:p-10">
          <Link href="/" className="inline-flex w-fit items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/76 backdrop-blur-xl transition hover:bg-white/[0.08] hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            Back to site
          </Link>

          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/24 px-4 py-2 text-sm font-semibold text-white/76 backdrop-blur-xl">
              <LockKeyhole className="h-4 w-4 text-[#59dfe0]" />
              Admin Operations Portal
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl lg:text-6xl">
              Secure control for HYMN operations.
            </h1>
            <p className="mt-5 text-base leading-7 text-white/64 sm:text-lg">
              Access release review, payout controls, user management, notifications, and platform operations from one protected admin workspace.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: ServerCog, title: "Operations", body: "Queues and reviews" },
              { icon: Command, title: "Control center", body: "Admin workflows" },
              { icon: ShieldCheck, title: "Protected access", body: "Google workspace only" }
            ].map((item) => {
              const ItemIcon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl">
                  <ItemIcon className="h-5 w-5 text-[#59dfe0]" />
                  <p className="mt-4 text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-white/52">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center p-4 sm:p-6 lg:p-10">
          <div className="w-full rounded-[1.75rem] border border-white/10 bg-white/[0.075] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:p-7">
            <div className="rounded-[1.35rem] border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 92%, transparent)" }}>
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--accent)" }}>
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-3xl font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>Admin Access</h2>
                  <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                    Securely login with your approved Google workspace account. Admin access remains governed by the existing HYMN access rules.
                  </p>
                </div>
              </div>

              <div className="my-6 h-px" style={{ background: "var(--border)" }} />

              <div className="grid gap-3 rounded-[1.25rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
                  <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                  Google is the only authentication provider.
                </div>
                <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
                  <LockKeyhole className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                  Admin operations are available only to approved admin identities.
                </div>
              </div>

              <div className="mt-6">
                <GoogleAuthButton label="Continue with Google" className="w-full" loginContext="admin" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// vercel trigger 2

// vercel trigger 3
