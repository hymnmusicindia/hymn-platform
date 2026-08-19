import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ProducerApplicationForm } from "@/components/producer-application-form";
import { getCurrentUserForPage } from "@/lib/access";
import { findLatestProducerApplicationByUser } from "@/lib/db";

export default async function SellYourBeatsPage() {
  const user = await getCurrentUserForPage();
  const application = user ? await findLatestProducerApplicationByUser(user.id) : null;
  const sections = [
    ["Apply", "Submit your producer application with catalog details and links."],
    ["Get Approved", "HYMN reviews your fit, quality, and release readiness."],
    ["Upload + Sell", "Use the producer dashboard to upload beats and monitor sales."]
  ] as const;

  return (
    <main className="shell py-12 sm:py-16">
      <div className="max-w-4xl">
        <span className="eyebrow">Sell Your Beats</span>
        <h1 className="text-3xl font-semibold sm:text-4xl lg:text-5xl" style={{ color: 'var(--text)' }}>Apply to sell your beats through HYMN&apos;s producer network.</h1>
        <p className="mt-4 text-sm sm:text-base" style={{ color: 'var(--text-muted)' }}>
          HYMN&apos;s producer system is built for catalog uploads, verified sales, role-based dashboard access, and payout-side visibility tied directly to real orders.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6">
        {sections.map(([title, body]) => (
          <details key={`${title}-mobile`} className="ios-collapse rounded-[1.2rem] p-4 md:hidden">
            <summary className="flex list-none items-center justify-between gap-3 text-base font-semibold" style={{ color: "var(--text)" }}>
              {title}
              <ChevronDown className="ios-collapse-icon h-4 w-4 shrink-0" style={{ color: "var(--text-soft)" }} />
            </summary>
            <div className="ios-collapse-content">
              <div className="ios-collapse-inner">
                <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{body}</p>
              </div>
            </div>
          </details>
        ))}
        {sections.map(([title, body]) => (
          <article key={`${title}-desktop`} className="hidden surface-card p-6 md:block">
            <h2 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
            <p className="mt-4" style={{ color: 'var(--text-muted)' }}>{body}</p>
          </article>
        ))}
      </div>

      <div className="mt-8 sm:mt-10">
        {user ? (
          <ProducerApplicationForm existingApplication={application} />
        ) : (
          <div className="surface-card p-10 text-center">
            <h2 className="text-3xl font-semibold" style={{ color: 'var(--text)' }}>Sign in to apply as a producer.</h2>
            <p className="mx-auto mt-4 max-w-2xl" style={{ color: 'var(--text-muted)' }}>Producer applications are tied to authenticated user accounts so HYMN can approve and route access correctly.</p>
            <div className="mt-8 flex justify-center">
              <Link href="/login?role=producer" className="btn-primary pressable">Go to Login</Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

