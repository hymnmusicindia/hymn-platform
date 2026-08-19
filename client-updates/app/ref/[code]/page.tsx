import Link from "next/link";
import { ArrowRight, Gift, ShieldCheck, Sparkles } from "lucide-react";
import { REFERRAL_FRIEND_DISCOUNT, REFERRAL_REWARD_AMOUNT } from "@/lib/checkout";
import { findUserByReferralCode } from "@/lib/db";

export default async function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const referrer = await findUserByReferralCode(decodeURIComponent(code));

  return (
    <main className="pb-20">
      <section className="shell py-10 sm:py-14">
        <div className="relative overflow-hidden rounded-[2rem] border p-6 sm:p-10 lg:p-12" style={{ borderColor: "var(--border)", background: "linear-gradient(140deg, var(--card), var(--bg-soft))" }}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1" style={{ background: "linear-gradient(90deg, var(--money), var(--accent))" }} />
          <div className="max-w-3xl">
            <span className="eyebrow">Referral reward</span>
            <h1 className="mt-5 text-4xl font-semibold sm:text-5xl" style={{ color: "var(--text)" }}>
              Claim Rs {REFERRAL_FRIEND_DISCOUNT.toLocaleString("en-IN")} off your first HYMN checkout.
            </h1>
            <p className="mt-4 text-base leading-7" style={{ color: "var(--text-muted)" }}>
              {referrer ? `${referrer.name} invited you to HYMN.` : "This referral link is ready to use."} Create your account and the referral benefit will be attached automatically.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: Gift, title: "You save", copy: `Rs ${REFERRAL_FRIEND_DISCOUNT} discount on the first paid order.` },
              { icon: Sparkles, title: "They earn", copy: `Rs ${REFERRAL_REWARD_AMOUNT} credits after your first successful payment.` },
              { icon: ShieldCheck, title: "Secure checkout", copy: "Rewards unlock only after backend payment verification." }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-[1.25rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                  <Icon className="h-5 w-5" style={{ color: "var(--text-soft)" }} />
                  <h2 className="mt-4 text-lg font-semibold" style={{ color: "var(--text)" }}>{item.title}</h2>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{item.copy}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/login?ref=${encodeURIComponent(code)}`} className="btn-primary pressable">
              Claim your reward
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/distribution" className="btn-outline pressable">Explore HYMN</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
