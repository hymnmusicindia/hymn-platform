import { UnifiedAuthForm } from "@/components/unified-auth-form";
import type { UserRole } from "@/lib/types";

type AuthRole = Exclude<UserRole, "admin">;

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ role?: string; mode?: string; ref?: string }> }) {
  const params = (await searchParams) ?? {};
  const role = params.role === "producer" ? "producer" : "customer";
  const mode = params.mode === "signup" || params.ref ? "signup" : "login";

  return (
    <main className="shell py-16">
      <UnifiedAuthForm initialRole={role as AuthRole} initialMode={mode} initialReferralCode={params.ref} />
    </main>
  );
}
