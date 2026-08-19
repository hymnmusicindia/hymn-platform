"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, BarChart3, CheckCircle2, Globe2, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { GoogleAuthButton } from "@/components/google-auth-button";
import type { UserRole } from "@/lib/types";

type AuthRole = Exclude<UserRole, "admin">;
type AuthMode = "login" | "signup";

export function UnifiedAuthForm({
  initialRole = "customer",
  initialReferralCode = ""
}: {
  initialRole?: AuthRole;
  initialMode?: AuthMode;
  initialReferralCode?: string;
}) {
  const [referralCode, setReferralCode] = useState(initialReferralCode);

  return (
    <section className="relative isolate overflow-hidden rounded-[2rem] border shadow-[0_34px_120px_rgba(0,0,0,0.28)]" style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, var(--card), var(--bg-soft))" }}>
      <div className="pointer-events-none absolute inset-0 opacity-80" style={{ background: "radial-gradient(circle at 16% 20%, rgba(89,223,224,0.18), transparent 30%), radial-gradient(circle at 80% 8%, rgba(245,193,108,0.12), transparent 26%), linear-gradient(135deg, rgba(255,255,255,0.06), transparent 45%)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.45)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.45)_1px,transparent_1px)] [background-size:42px_42px]" />

      <div className="relative grid min-h-[680px] lg:grid-cols-[1.05fr,0.95fr]">
        <div className="login-portal-brand flex flex-col justify-between gap-10 p-6 sm:p-8 lg:p-10">
          <div>
            <Link href="/" className="login-portal-back inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold backdrop-blur-xl transition">
              <ArrowLeft className="h-4 w-4" />
              Back to site
            </Link>
          </div>

          <div className="login-portal-hero-copy max-w-2xl rounded-[1.5rem] border p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:p-6">
            <h1 className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl lg:text-6xl">
              Distribute. Manage. Grow.
            </h1>
            <p className="login-portal-hero-muted mt-5 max-w-xl text-base leading-7 sm:text-lg">
              Access your HYMN workspace for releases, approvals, dashboards, uploads, and artist growth systems.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: UploadCloud, title: "Release ops", body: "Upload and track delivery" },
              { icon: BarChart3, title: "Live signal", body: "Analytics and payout visibility" },
              { icon: Globe2, title: "Global reach", body: "Distribution-first workspace" }
            ].map((item) => {
              const ItemIcon = item.icon;
              return (
                <div key={item.title} className="login-portal-feature-card rounded-2xl border p-4 shadow-[0_18px_50px_rgba(0,0,0,0.14)] backdrop-blur-xl">
                  <ItemIcon className="h-5 w-5 text-[#59dfe0]" />
                  <p className="mt-4 text-sm font-semibold">{item.title}</p>
                  <p className="login-portal-feature-muted mt-1 text-xs leading-5">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center p-4 sm:p-6 lg:p-10">
          <div className="w-full rounded-[1.75rem] border border-white/10 bg-white/[0.075] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.26)] backdrop-blur-2xl sm:p-7">
            <div className="rounded-[1.35rem] border p-5 sm:p-6" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 90%, transparent)" }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-semibold tracking-[-0.02em]" style={{ color: "var(--text)" }}>Access your HYMN workspace.</h2>
                  <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                    Google is the only authentication provider. Your Google account keeps sessions, roles, uploads, and approvals tied to one secure identity.
                  </p>
                </div>
                <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border sm:inline-flex" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}>
                  <ShieldCheck className="h-5 w-5" />
                </span>
              </div>

              <div className="my-6 h-px" style={{ background: "var(--border)" }} />

              <div className="grid gap-3">
                {[
                  "Secure artist workspace access",
                  "One Google identity for dashboards and uploads",
                  "Release, analytics, services, and payout tools in one place"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
                    <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                    {item}
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-[1.25rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Google authentication</p>
                <p className="mb-4 mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  Sign in or create a new artist account with your Google identity.
                </p>
                <GoogleAuthButton label="Continue with Google" className="w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// vercel trigger 2
