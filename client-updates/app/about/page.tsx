import { ChevronDown } from "lucide-react";

export default function AboutPage() {
  const sections = [
    ["Distribution", "Artists submit releases, upload assets, and track status changes from dashboard to admin review."],
    ["Beat marketplace", "Customers can license beats with live order records, downloads, and payment verification."],
    ["Producer operations", "Approved producers manage their own beat catalog, earnings, and sales history from a dedicated dashboard."]
  ] as const;

  return (
    <main className="shell py-12 sm:py-16">
      <div className="max-w-4xl">
        <span className="eyebrow">About HYMN</span>
        <h1 className="text-3xl font-semibold text-white sm:text-4xl lg:text-5xl">HYMN combines label services, distribution ops, and beat commerce in one platform.</h1>
        <p className="mt-4 text-sm text-white/68 sm:text-base">
          The product is designed for artists, producers, managers, and operators who need a dark, premium workflow layer instead of disconnected static pages.
        </p>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6">
        {sections.map(([title, body]) => (
          <details key={`${title}-mobile`} className="ios-collapse rounded-[1.2rem] p-4 md:hidden">
            <summary className="flex list-none items-center justify-between gap-3 text-base font-semibold text-white">
              {title}
              <ChevronDown className="ios-collapse-icon h-4 w-4 shrink-0 text-white/70" />
            </summary>
            <div className="ios-collapse-content">
              <div className="ios-collapse-inner">
                <p className="mt-3 text-sm text-white/65">{body}</p>
              </div>
            </div>
          </details>
        ))}
        {sections.map(([title, body]) => (
          <article key={`${title}-desktop`} className="hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 md:block">
            <h2 className="text-2xl font-semibold text-white">{title}</h2>
            <p className="mt-4 text-white/65">{body}</p>
          </article>
        ))}
      </div>
    </main>
  );
}


