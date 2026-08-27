"use client";

import { useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SkipForward } from "lucide-react";

export type HomeCarouselSlide = {
  kicker: string;
  title?: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

export function HomeCarousel({ slides }: { slides: HomeCarouselSlide[] }) {
  const [index, setIndex] = useState(0);
  const swipeStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const activeSlide = useMemo(() => slides[index % Math.max(slides.length, 1)], [index, slides]);

  function go(delta: number) {
    if (!slides.length) return;
    setIndex((current) => (current + delta + slides.length) % slides.length);
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    swipeStartRef.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    if (swipeStartRef.current === null || slides.length < 2) return;
    const end = event.changedTouches[0]?.clientX ?? swipeStartRef.current;
    const delta = end - swipeStartRef.current;
    swipeStartRef.current = null;
    if (Math.abs(delta) < 40) return;
    go(delta < 0 ? 1 : -1);
  }

  if (!activeSlide) return null;

  return (
    <section className="surface-card overflow-hidden p-0" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="grid gap-0 lg:grid-cols-[1.1fr,0.9fr]">
        <div className="flex flex-col justify-between gap-8 p-6 sm:p-8 lg:p-10">
          <div>
            <div className="max-w-2xl transition-opacity duration-300">
              {activeSlide.title ? <h2 className="text-3xl font-semibold sm:text-5xl" style={{ color: "var(--text)" }}>{activeSlide.title}</h2> : null}
              <p className="mt-4 max-w-xl text-sm sm:text-base" style={{ color: "var(--text-muted)" }}>{activeSlide.body}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link href={activeSlide.ctaHref} className="btn-primary pressable">
              {activeSlide.ctaLabel}
            </Link>
            <button type="button" onClick={() => go(-1)} className="inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }} aria-label="Previous slide">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => go(1)} className="inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }} aria-label="Next slide">
              <ChevronRight className="h-4 w-4" />
            </button>
            <Link href="#offerings" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}>
              <SkipForward className="h-4 w-4" />
              Skip
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {slides.map((slide, slideIndex) => {
              const active = slideIndex === index;
              return (
                <button
                  key={`${slide.kicker}-${slide.ctaHref}`}
                  type="button"
                  onClick={() => setIndex(slideIndex)}
                  className="rounded-2xl border p-3 text-left transition hover:scale-[1.01]"
                  style={{ borderColor: active ? "var(--border-strong)" : "var(--border)", background: active ? "var(--card-strong)" : "var(--bg-soft)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>{String(slideIndex + 1).padStart(2, "0")}</p>
                  <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text)" }}>{slide.kicker}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t lg:border-l lg:border-t-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex h-full min-h-[360px] flex-col justify-between p-6 sm:p-8 lg:p-10" style={{ background: "linear-gradient(180deg, var(--bg-soft), var(--bg-elevated))" }}>
            <div className="flex items-center justify-end gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: "var(--text-soft)" }}>{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</p>
            </div>
            <div className="mt-8 space-y-3">
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((index + 1) / slides.length) * 100}%`, background: "var(--accent)" }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {slides.map((slide, slideIndex) => (
                  <span
                    key={`${slide.kicker}-${slide.ctaHref}`}
                    className="inline-flex h-2.5 w-8 rounded-full transition-all"
                    style={{ background: slideIndex === index ? "var(--accent)" : "var(--border)" }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



// vercel trigger 2
