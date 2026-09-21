import { ClaimContributorForm } from "@/components/claim-contributor-form";

export default async function ClaimContributorPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  return <main className="shell py-16"><section className="surface-card mx-auto max-w-xl p-6 sm:p-8"><p className="text-xs uppercase tracking-[0.18em] text-muted">Contributor identity</p><h1 className="mt-3 text-3xl font-semibold">Claim your existing HYMN identity</h1><p className="mt-3 text-sm leading-6 text-muted">Claiming links this account to the producer or contributor identity that already owns its historical credits. It does not create a second profile.</p><ClaimContributorForm token={token} /></section></main>;
}
