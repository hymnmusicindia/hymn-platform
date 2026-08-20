"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@/lib/types";

type DemoRole = Exclude<UserRole, "admin">;

const mockLoginEnabled = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_MOCK_LOGIN !== "false";

const roleLabels: Record<DemoRole, string> = {
  producer: "Producer",
  customer: "Customer"
};

export function MockLoginButton({
  role,
  label,
  className
}: {
  role: DemoRole;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!mockLoginEnabled) return null;

  async function handleClick() {
    if (processing) return;

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/mock-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error ?? "Mock login failed.");
      }

      if (data?.redirectPath) {
        router.push(data.redirectPath);
        router.refresh();
        return;
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Mock login failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={processing}
        className={clsx(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-6 py-3 text-sm font-semibold transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70",
          className
        )}
        style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}
      >
        {processing ? "Opening demo account..." : label ?? `Use Demo ${roleLabels[role]} Account`}
      </button>
      {error ? (
        <p className="text-xs" style={{ color: "var(--danger)" }} aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}
// vercel trigger 5
