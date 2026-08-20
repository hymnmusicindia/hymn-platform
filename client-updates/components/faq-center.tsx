"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BadgeDollarSign, ChevronDown, CreditCard, Music4, Search, Settings2, Users, MessageSquareMore } from "lucide-react";

type FaqCategory = "distribution" | "pricing" | "artist-profiles" | "payments" | "technical" | "account";

type FaqItem = {
  id: string;
  category: FaqCategory;
  categoryLabel: string;
  icon: ReactNode;
  question: string;
  answer: ReactNode;
  searchText: string;
};

const faqItems: FaqItem[] = [
  {
    id: "release-timing",
    category: "distribution",
    categoryLabel: "Distribution",
    icon: <Music4 className="h-4 w-4" />,
    question: "How long does a release take?",
    answer: (
      <>
        <p>
          Once your package is complete, payment is verified, and HYMN approves the submission, the release enters the distribution queue. Internal review is usually fast, but DSP delivery times still depend on each platform.
        </p>
        <p>
          For scheduled releases, submit at least 20 days before the intended go-live date so the stores have enough time to process the metadata.
        </p>
      </>
    ),
    searchText: "how long release take timing distribution queue scheduled release 20 days review"
  },
  {
    id: "platforms-included",
    category: "distribution",
    categoryLabel: "Distribution",
    icon: <Music4 className="h-4 w-4" />,
    question: "Which platforms are included?",
    answer: (
      <>
        <p>
          HYMN supports leading DSP destinations such as Spotify, Apple Music, YouTube Music, Amazon Music, JioSaavn, Gaana, and other supported services shown in the release flow.
        </p>
        <p>
          The exact list can vary by release type, rights clearances, and the platform options available at checkout.
        </p>
      </>
    ),
    searchText: "which platforms included spotify apple music youtube music amazon jiosaavn gaana dsp"
  },
  {
    id: "dsp-vs-ugc",
    category: "distribution",
    categoryLabel: "Distribution",
    icon: <Music4 className="h-4 w-4" />,
    question: "What is the difference between DSP and UGC?",
    answer: (
      <>
        <p>
          DSPs, or digital service providers, are streaming stores such as Spotify and Apple Music where your release is delivered as a catalog product.
        </p>
        <p>
          UGC, or user-generated content, refers to platforms where short-form video or creator uploads can match against your music. Those systems may use fingerprinting or claim workflows, so the rules are different from standard DSP delivery.
        </p>
      </>
    ),
    searchText: "difference between dsp and ugc content id streaming stores user generated content"
  },
  {
    id: "what-in-99",
    category: "pricing",
    categoryLabel: "Pricing",
    icon: <BadgeDollarSign className="h-4 w-4" />,
    question: "What does ₹99 include?",
    answer: (
      <>
        <p>
          The ₹99 one-time option covers a single release submission, metadata review, artwork check, quality control, and handoff to distribution.
        </p>
        <p>
          It does not include paid ads, promo campaigns, or extra services that are not listed in checkout.
        </p>
      </>
    ),
    searchText: "what does 99 include one time release submission qc artwork review handoff"
  },
  {
    id: "content-id",
    category: "pricing",
    categoryLabel: "Pricing",
    icon: <BadgeDollarSign className="h-4 w-4" />,
    question: "What is Content ID?",
    answer: (
      <>
        <p>
          Content ID is a fingerprinting system used by platforms such as YouTube to detect and match recordings. It can help identify use of your music, but only if you have the rights needed for that registration.
        </p>
        <p>
          HYMN does not automatically promise Content ID enrollment for every release. If a matching or claim workflow is available, it must follow the rights and platform rules shown in the product.
        </p>
      </>
    ),
    searchText: "what is content id fingerprinting youtube claim rights"
  },
  {
    id: "hidden-charges",
    category: "pricing",
    categoryLabel: "Pricing",
    icon: <BadgeDollarSign className="h-4 w-4" />,
    question: "Are there hidden charges?",
    answer: (
      <>
        <p>
          No hidden HYMN charges are added after the price shown at checkout. If taxes or gateway fees apply, they are displayed before you pay.
        </p>
        <p>
          If anything on screen looks unclear, contact support before confirming payment.
        </p>
      </>
    ),
    searchText: "hidden charges fees taxes gateway checkout price"
  },
  {
    id: "spotify-profile",
    category: "artist-profiles",
    categoryLabel: "Artist Profiles",
    icon: <Users className="h-4 w-4" />,
    question: "How do I link my Spotify profile?",
    answer: (
      <>
        <p>
          Enter the exact artist name used on Spotify and select the matching artist profile in the release flow when it appears.
        </p>
        <p>
          If you already have a Spotify for Artists profile, use the same artist identity so the release maps to the right page after delivery.
        </p>
      </>
    ),
    searchText: "how link spotify profile artist for artists exact name"
  },
  {
    id: "new-artist",
    category: "artist-profiles",
    categoryLabel: "Artist Profiles",
    icon: <Users className="h-4 w-4" />,
    question: "What if the artist is new?",
    answer: (
      <>
        <p>
          You can still submit a release for a new artist name. HYMN will use the legal and display metadata you provide, and the DSP may create or map an artist profile according to its own rules.
        </p>
        <p>
          Keep the artist name consistent across all releases to make future matching easier.
        </p>
      </>
    ),
    searchText: "what if artist is new create new profile dsp map metadata"
  },
  {
    id: "refund-policy",
    category: "payments",
    categoryLabel: "Payments",
    icon: <CreditCard className="h-4 w-4" />,
    question: "What is the refund policy?",
    answer: (
      <>
        <p>
          Once a release has been submitted for review or payment processing has started, fees are generally non-refundable.
        </p>
        <p>
          Refunds are only considered where required by law or where HYMN approves a written exception.
        </p>
      </>
    ),
    searchText: "refund policy non refundable review processing started law exception"
  },
  {
    id: "failed-payments",
    category: "payments",
    categoryLabel: "Payments",
    icon: <CreditCard className="h-4 w-4" />,
    question: "What happens if a payment fails?",
    answer: (
      <>
        <p>
          If payment fails, the release does not move into the review queue. You can retry the payment from the checkout flow or contact support if the issue keeps happening.
        </p>
        <p>
          Your draft remains available so you do not have to rebuild the release from scratch.
        </p>
      </>
    ),
    searchText: "failed payment retry checkout release does not move queue draft remains"
  },
  {
    id: "file-requirements",
    category: "technical",
    categoryLabel: "Technical",
    icon: <Settings2 className="h-4 w-4" />,
    question: "What are the file requirements?",
    answer: (
      <>
        <p>
          WAV is preferred for masters, and MP3 is accepted. Upload one audio file per track in the release flow.
        </p>
        <p>
          Artwork should be JPG or PNG, square, and between 1500 x 1500 px and 4500 x 4500 px.
        </p>
      </>
    ),
    searchText: "file requirements wav mp3 artwork jpg png square 1500 4500"
  },
  {
    id: "artwork-guidelines",
    category: "technical",
    categoryLabel: "Technical",
    icon: <Settings2 className="h-4 w-4" />,
    question: "What artwork guidelines should I follow?",
    answer: (
      <>
        <p>
          Keep the cover art clean, square, and legible on mobile. Avoid low-resolution images, heavy borders, tiny text, and layouts that look cluttered at thumbnail size.
        </p>
        <p>
          The upload tool will also flag obvious technical issues before submission.
        </p>
      </>
    ),
    searchText: "artwork guidelines clean square legible mobile low resolution text"
  },
  {
    id: "upgrade-subscription",
    category: "account",
    categoryLabel: "Account",
    icon: <MessageSquareMore className="h-4 w-4" />,
    question: "How do I upgrade my subscription?",
    answer: (
      <>
        <p>
          Open the distribution flow and choose the half-yearly or annual plan at checkout. The plan you select controls release allowance and queue priority.
        </p>
        <p>
          If you are already on a plan, contact support before switching so we can help you choose the best option.
        </p>
      </>
    ),
    searchText: "upgrade subscription half yearly annual checkout release allowance priority"
  },
  {
    id: "track-status",
    category: "account",
    categoryLabel: "Account",
    icon: <MessageSquareMore className="h-4 w-4" />,
    question: "How do I track release status?",
    answer: (
      <>
        <p>
          Visit <Link href="/dashboard/releases" className="font-semibold underline underline-offset-4">Your Releases</Link> to see drafts, scheduled releases, and released catalog items in one place.
        </p>
        <p>
          Each card shows the current stage and the next action so you can continue without hunting through the dashboard.
        </p>
      </>
    ),
    searchText: "track release status dashboard releases drafts scheduled released"
  }
];

const categoryFilters: Array<{ key: "all" | FaqCategory; label: string; icon: ReactNode }> = [
  { key: "all", label: "All", icon: <MessageSquareMore className="h-4 w-4" /> },
  { key: "distribution", label: "Distribution", icon: <Music4 className="h-4 w-4" /> },
  { key: "pricing", label: "Pricing", icon: <BadgeDollarSign className="h-4 w-4" /> },
  { key: "artist-profiles", label: "Artist Profiles", icon: <Users className="h-4 w-4" /> },
  { key: "payments", label: "Payments", icon: <CreditCard className="h-4 w-4" /> },
  { key: "technical", label: "Technical", icon: <Settings2 className="h-4 w-4" /> },
  { key: "account", label: "Account", icon: <MessageSquareMore className="h-4 w-4" /> }
];

export function FaqCenter() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | FaqCategory>("all");
  const [openId, setOpenId] = useState<string | null>(faqItems[0]?.id ?? null);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return faqItems.filter((item) => {
      const matchesCategory = activeCategory === "all" || item.category === activeCategory;
      const matchesQuery = !normalizedQuery || [item.question, item.searchText, item.categoryLabel].join(" ").toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, query]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setOpenId(null);
      return;
    }
    if (!openId || !filteredItems.some((item) => item.id === openId)) {
      setOpenId(filteredItems[0].id);
    }
  }, [filteredItems, openId]);

  const counts = useMemo(() => {
    const base = { all: faqItems.length, distribution: 0, pricing: 0, "artist-profiles": 0, payments: 0, technical: 0, account: 0 } as Record<"all" | FaqCategory, number>;
    for (const item of faqItems) base[item.category] += 1;
    return base;
  }, []);

  return (
    <div className="space-y-5">
      <section className="surface-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.24em]" style={{ color: "var(--text-soft)" }}>
              Search answers
            </p>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
              Frequently Asked Questions
            </h2>
            <p className="max-w-2xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>
              Search by topic, platform, pricing, or account question to get a quick answer without leaving the page.
            </p>
          </div>
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-soft)" }} />
            <input
              className="field pl-11"
              placeholder="Search questions"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search FAQ questions"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {categoryFilters.map((filter) => {
            const active = filter.key === activeCategory;
            const count = counts[filter.key];
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveCategory(filter.key)}
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition pressable"
                style={active ? { borderColor: "var(--border-strong)", background: "var(--accent-soft)", color: "var(--text)" } : { borderColor: "var(--border)", background: "var(--card)", color: "var(--text-muted)" }}
              >
                {filter.icon}
                <span>{filter.label}</span>
                <span className="text-xs" style={{ color: active ? "var(--text)" : "var(--text-soft)" }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            const open = openId === item.id;
            return (
              <article key={item.id} className="surface-card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-start gap-4 p-5 text-left sm:p-6"
                  onClick={() => setOpenId((current) => (current === item.id ? null : item.id))}
                  aria-expanded={open}
                  aria-controls={`faq-panel-${item.id}`}
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border" style={{ borderColor: open ? "var(--border-strong)" : "var(--border)", background: open ? "var(--accent-soft)" : "var(--bg-soft)", color: "var(--text)" }}>
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip">{item.categoryLabel}</span>
                      {open ? <span className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>Open</span> : null}
                    </div>
                    <h3 className="mt-3 text-lg font-semibold sm:text-xl" style={{ color: "var(--text)" }}>
                      {item.question}
                    </h3>
                  </div>
                  <ChevronDown className={`mt-1 h-5 w-5 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`} style={{ color: "var(--text-soft)" }} />
                </button>
                <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="overflow-hidden">
                    <div id={`faq-panel-${item.id}`} className="border-t px-5 pb-5 pt-0 sm:px-6 sm:pb-6" style={{ borderColor: "var(--border)" }}>
                      <div className="space-y-4 text-[15px] leading-7" style={{ color: "var(--text-muted)" }}>
                        {item.answer}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <article className="surface-card p-6 text-center sm:p-8">
            <h3 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
              No questions match your search
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>
              Try a broader keyword or switch to another filter to find the answer faster.
            </p>
            <button type="button" className="btn-secondary pressable mt-5" onClick={() => { setQuery(""); setActiveCategory("all"); }}>
              Reset filters
            </button>
          </article>
        )}
      </section>

      <section className="surface-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.24em]" style={{ color: "var(--text-soft)" }}>
              Still need help?
            </p>
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
              Contact our support team
            </h2>
            <p className="max-w-2xl text-sm leading-7" style={{ color: "var(--text-muted)" }}>
              If the FAQ did not answer your question, our support page can help with releases, artist profiles, payments, or technical issues.
            </p>
          </div>
          <Link href="/contact" className="btn-primary pressable w-full sm:w-auto">
            Contact Support
          </Link>
        </div>
      </section>
    </div>
  );
}

