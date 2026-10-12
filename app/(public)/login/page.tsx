import { UnifiedAuthForm } from "@/components/unified-auth-form";
import type { UserRole } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { normalizeReferralCode } from "@/lib/referrals";

type AuthRole = Exclude<UserRole, "admin">;

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ role?: string; mode?: string; ref?: string; referralError?: string }> }) {
  const params = (await searchParams) ?? {};
  const role = params.role === "producer" ? "producer" : "customer";
  const mode = params.mode === "signup" || params.ref ? "signup" : "login";
  const inviter = params.ref ? await prisma.user.findFirst({ where: { referralCode: { equals: normalizeReferralCode(params.ref), mode: "insensitive" }, status: "ACTIVE" }, select: { name: true, referralCode: true } }) : null;

  return (
    <main className="auth-standalone-page relative min-h-screen overflow-hidden py-6 sm:py-10">
      <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 32%, rgba(155,168,190,0.075), transparent 70%)" }} />
      <div className="shell relative">
        <UnifiedAuthForm initialRole={role as AuthRole} initialMode={mode} initialReferralCode={inviter?.referralCode || undefined} invitedBy={inviter?.name} referralError={params.referralError || (params.ref && !inviter ? "invalid" : undefined)} />
      </div>
    </main>
  );
}

// vercel trigger 2

// vercel trigger 12
