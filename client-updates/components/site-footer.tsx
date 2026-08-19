import Link from "next/link";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { footerColumns } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t backdrop-blur-xl" style={{ borderColor: "var(--glass-border)", background: "color-mix(in srgb, var(--glass-bg-strong) 82%, transparent)" }}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr,1fr,1fr,1fr]">
          <div className="space-y-4">
            <Image src="/assets/hymnlogowhite.png" alt="HYMN Music" width={164} height={56} className="h-12 w-auto object-contain" style={{ filter: "var(--logo-filter)" }} />
            <p className="max-w-sm text-sm leading-6" style={{ color: "var(--text-soft)" }}>
              India&apos;s leading music distribution platform connecting artists and producers worldwide.
            </p>
          </div>

          <div className="grid gap-3 lg:hidden">
            {[
              { title: "For Artists", items: footerColumns.artists },
              { title: "For Producers", items: footerColumns.producers },
              { title: "Company", items: footerColumns.company }
            ].map((section) => (
              <details key={section.title} className="ios-collapse rounded-[1.35rem] px-4 py-3">
                <summary className="flex list-none items-center justify-between gap-3 text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {section.title}
                  <ChevronDown className="ios-collapse-icon h-4 w-4 shrink-0" />
                </summary>
                <div className="ios-collapse-content">
                  <div className="ios-collapse-inner mt-4 space-y-3 text-sm" style={{ color: "var(--text-soft)" }}>
                    {section.items.map((item) => (
                      <Link key={item.label} href={item.href} className="block" style={{ color: "inherit" }}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>

          <div className="hidden lg:block">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>For Artists</h3>
            <div className="mt-4 space-y-3 text-sm" style={{ color: "var(--text-soft)" }}>
              {footerColumns.artists.map((item) => (
                <Link key={item.label} href={item.href} className="block" style={{ color: "inherit" }}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>For Producers</h3>
            <div className="mt-4 space-y-3 text-sm" style={{ color: "var(--text-soft)" }}>
              {footerColumns.producers.map((item) => (
                <Link key={item.label} href={item.href} className="block" style={{ color: "inherit" }}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Company</h3>
            <div className="mt-4 space-y-3 text-sm" style={{ color: "var(--text-soft)" }}>
              {footerColumns.company.map((item) => (
                <Link key={item.label} href={item.href} className="block" style={{ color: "inherit" }}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="border-t px-4 py-4 text-center text-sm sm:px-6 lg:px-8" style={{ borderColor: "var(--glass-border)", color: "var(--text-soft)" }}>
        <p>2026 HYMN Music. Made with love in India. All rights reserved.</p>
      </div>
    </footer>
  );
}
