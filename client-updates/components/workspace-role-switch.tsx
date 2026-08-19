"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { destinationForRole } from "@/lib/routes";
import type { UserRole } from "@/lib/types";

export function WorkspaceRoleSwitch({ currentRole }: { currentRole: Exclude<UserRole, "admin"> }) {
  const router = useRouter();
  const [loadingRole, setLoadingRole] = useState<Exclude<UserRole, "admin"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nextRole = currentRole === "customer" ? "producer" : "customer";

  async function switchRole(targetRole: Exclude<UserRole, "admin">) {
    if (targetRole === currentRole || loadingRole) return;

    setLoadingRole(targetRole);
    setError(null);

    try {
      const response = await fetch("/api/auth/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: targetRole })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not switch workspace.");
      router.push(data.redirectPath ?? destinationForRole(targetRole));
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not switch workspace.");
    } finally {
      setLoadingRole(null);
    }
  }

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Workspace role</p>
          <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Switch to {currentRole === "customer" ? "Producer" : "Artist"} mode</h2>
          <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--text-muted)" }}>
            Approved accounts can switch between customer and producer views without leaving the dashboard.
          </p>
        </div>
        <div className="rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em]" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text-soft)" }}>
          Current: {currentRole}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {([
          ["customer", "Artist (Customer)"] as const,
          ["producer", "Producer"] as const
        ]).map(([role, label]) => {
          const active = role === currentRole;
          const pending = loadingRole === role;
          return (
            <button
              key={role}
              type="button"
              onClick={() => switchRole(role)}
              disabled={active || Boolean(loadingRole)}
              className={clsx("rounded-2xl border px-4 py-4 text-left transition", active ? "shadow-glow" : "hover-lift")}
              style={{
                borderColor: active ? "var(--border-strong)" : "var(--border)",
                background: active ? "var(--accent)" : "var(--card)",
                color: active ? "var(--accent-foreground)" : "var(--text)"
              }}
            >
              <span className="block text-sm font-semibold uppercase tracking-[0.22em]">{label}</span>
              <span className="mt-2 block text-sm" style={{ color: active ? "inherit" : "var(--text-muted)" }}>
                {active ? "Active workspace" : pending ? "Switching..." : `Switch to ${label}`}
              </span>
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}
      <p className="mt-4 text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>
        {nextRole === "producer" ? "Producer approval may be required on live deployments." : "Customer mode is always available in dev."}
      </p>
    </section>
  );
}
