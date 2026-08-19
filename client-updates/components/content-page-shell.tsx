import Link from "next/link";
import { CalendarDays, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export type ContentPageSection = {
  title: string;
  body: ReactNode;
  icon?: ReactNode;
};

export function ContentPageShell({
  eyebrow,
  title,
  intro,
  lastUpdated,
  sections,
  children,
  footerCta
}: {
  eyebrow: string;
  title: string;
  intro: string;
  lastUpdated?: string;
  sections?: ContentPageSection[];
  children?: ReactNode;
  footerCta?: { href: string; label: string; title?: string; body?: string };
}) {
  return (
    <main className="shell py-10 sm:py-14">
      <div className="mx-auto w-full max-w-[900px]">
        <header className="space-y-5">
          <span className="eyebrow">{eyebrow}</span>
          <div className="space-y-4">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--text)" }}>
              {title}
            </h1>
            <p className="max-w-3xl text-base leading-7 sm:text-lg" style={{ color: "var(--text-muted)" }}>
              {intro}
            </p>
          </div>
          {lastUpdated ? (
            <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text-muted)" }}>
              <CalendarDays className="h-4 w-4" />
              <span>Last updated: {lastUpdated}</span>
            </div>
          ) : null}
        </header>

        <div className="mt-10 grid gap-4">
          {sections
            ? sections.map((section) => (
                <details key={`${section.title}-mobile`} className="ios-collapse rounded-[1.15rem] p-4 sm:hidden">
                  <summary className="flex list-none items-center justify-between gap-3">
                    <span className="inline-flex min-w-0 items-center gap-2 text-base font-semibold" style={{ color: "var(--text)" }}>
                      {section.icon ? (
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}>
                          {section.icon}
                        </span>
                      ) : null}
                      <span className="truncate">{section.title}</span>
                    </span>
                    <ChevronDown className="ios-collapse-icon h-4 w-4 shrink-0" style={{ color: "var(--text-soft)" }} />
                  </summary>
                  <div className="ios-collapse-content">
                    <div className="ios-collapse-inner mt-3 space-y-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                      {section.body}
                    </div>
                  </div>
                </details>
              ))
            : null}

          {sections
            ? sections.map((section) => (
                <article key={`${section.title}-desktop`} className="hidden surface-card p-5 sm:block sm:p-6">
                  <div className="flex items-start gap-3">
                    {section.icon ? (
                      <span className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}>
                        {section.icon}
                      </span>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-semibold sm:text-2xl" style={{ color: "var(--text)" }}>
                        {section.title}
                      </h2>
                      <div className="mt-4 space-y-4 text-[15px] leading-7" style={{ color: "var(--text-muted)" }}>
                        {section.body}
                      </div>
                    </div>
                  </div>
                </article>
              ))
            : null}

          {children ? <div className="space-y-4">{children}</div> : null}
        </div>

        {footerCta ? (
          <section className="mt-10 surface-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                {footerCta.title ? (
                  <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
                    {footerCta.title}
                  </h2>
                ) : null}
                {footerCta.body ? (
                  <p className="max-w-2xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>
                    {footerCta.body}
                  </p>
                ) : null}
              </div>
              <Link href={footerCta.href} className="btn-primary pressable w-full sm:w-auto">
                {footerCta.label}
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
