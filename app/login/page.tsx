import { UnifiedAuthForm } from "@/components/unified-auth-form";
import type { UserRole } from "@/lib/types";

type AuthRole = Exclude<UserRole, "admin">;

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ role?: string; mode?: string; ref?: string }> }) {
  const params = (await searchParams) ?? {};
  const role = params.role === "producer" ? "producer" : "customer";
  const mode = params.mode === "signup" || params.ref ? "signup" : "login";

  return (
    <main className="relative min-h-[calc(100vh-73px)] overflow-hidden py-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 14% 18%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 32%), radial-gradient(circle at 86% 10%, color-mix(in srgb, var(--money) 10%, transparent), transparent 28%), linear-gradient(180deg, var(--bg), var(--bg-soft))" }} />
      <div className="shell relative">
        <UnifiedAuthForm initialRole={role as AuthRole} initialMode={mode} initialReferralCode={params.ref} />
      </div>
    </main>
  );
}

// vercel trigger 2
