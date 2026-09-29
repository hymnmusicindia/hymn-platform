import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function NewsletterUnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token?.trim();
  const subscriber = token ? await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } }) : null;
  if (subscriber?.status === "subscribed") await prisma.newsletterSubscriber.update({ where: { id: subscriber.id }, data: { status: "unsubscribed", unsubscribedAt: new Date() } });
  const completed = Boolean(subscriber);
  return <main className="shell flex min-h-[55vh] items-center py-16"><section className="surface-card max-w-xl p-7 sm:p-10"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">HYMN Music</p><h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--text)]">{completed ? "You’re unsubscribed." : "This unsubscribe link is invalid."}</h1><p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">{completed ? "You will no longer receive HYMN newsletter campaigns at this address." : "The link may have expired or already been replaced. You can subscribe again from the homepage whenever you choose."}</p><Link href="/" className="btn-primary mt-7 inline-flex">Back to home</Link></section></main>;
}
