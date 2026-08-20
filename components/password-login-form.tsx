"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { destinationForRole } from "@/lib/routes";
import type { UserRole } from "@/lib/types";

interface PasswordLoginFormProps {
  role: Exclude<UserRole, "admin">;
  title: string;
  description: string;
}

export function PasswordLoginForm({ role, title, description }: PasswordLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(role === "producer" ? "producer@test.com" : "customer@test.com");
  const [password, setPassword] = useState("123456");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Login failed.");
      router.push(data.redirectPath ?? destinationForRole(role));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[2rem] border border-border bg-white/5 p-8 text-left">
      <h1 className="text-2xl font-semibold text-white">{title}</h1>
      <p className="mt-3 text-sm text-white/65">{description}</p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm text-white/70">Email</label>
          <input className="mt-2 w-full rounded-2xl border border-border bg-black/30 px-4 py-3 text-white outline-none" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-white/70">Password</label>
          <input className="mt-2 w-full rounded-2xl border border-border bg-black/30 px-4 py-3 text-white outline-none" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className={clsx("w-full rounded-full px-5 py-3 text-sm font-semibold text-white transition", loading ? "bg-white/20" : "bg-white/90 text-black hover:bg-white")} type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Login"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      <div className="mt-5 rounded-2xl border border-dashed border-border bg-black/20 p-4 text-sm text-white/60">
        <p className="font-semibold text-white/80">Test credentials</p>
        <p className="mt-1">{role === "producer" ? "producer@test.com / 123456" : "customer@test.com / 123456"}</p>
      </div>
    </div>
  );
}

// vercel trigger 2
