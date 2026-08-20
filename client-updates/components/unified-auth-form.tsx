"use client";

import Link from "next/link";
import { useState } from "react";
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
  const [role, setRole] = useState<AuthRole>(initialRole);
  const [referralCode, setReferralCode] = useState(initialReferralCode);

  return (
    <section className="surface-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eyebrow">Secure Google SSO</span>
          <h1 className="text-4xl font-semibold" style={{ color: "var(--text)" }}>
            Enter HYMN with your Google account.
          </h1>
          <p className="mt-4 max-w-2xl text-sm sm:text-base" style={{ color: "var(--text-muted)" }}>
            HYMN uses Google as the only identity provider. Your Google account ID is the source of truth for sessions, roles, dashboards, uploads, and approvals.
          </p>
        </div>
        <Link href="/" className="inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}>
          Back to site
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {([
          ["customer", "Artist"] as const,
          ["producer", "Producer applicant"] as const
        ]).map(([value, label]) => {
          const active = role === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              className="rounded-full border px-4 py-2 text-sm font-semibold transition hover:translate-y-[-1px]"
              style={{ borderColor: active ? "var(--border-strong)" : "var(--border)", background: active ? "var(--accent)" : "var(--card)", color: active ? "var(--accent-foreground)" : "var(--text)" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-[1fr,0.85fr]">
        <div className="rounded-[1.5rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Google authentication</p>
          <p className="mb-4 mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            New artists are routed into onboarding. Producer applicants submit a review form before producer tools unlock.
          </p>
          <GoogleAuthButton expectedRole={role} referralCode={referralCode || undefined} label="Continue with Google" className="w-full" />
        </div>

        <aside className="rounded-[1.6rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <p className="eyebrow mb-3">Invite tracking</p>
          <label className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Referral code</label>
          <input className="field mt-2" value={referralCode} onChange={(event) => setReferralCode(event.target.value)} placeholder="Optional invite code" />
          <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
            Admin access is granted by adding the Google email to <code>ADMIN_GOOGLE_EMAILS</code>. There is no email/password fallback in production.
          </p>
        </aside>
      </div>
    </section>
  );
}
