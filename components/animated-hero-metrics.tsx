"use client";

import { useEffect, useRef, useState } from "react";

const metrics = [
  { target: 2.4, decimals: 1, suffix: "K+", label: "artists supported" },
  { target: 180, decimals: 0, suffix: "M+", label: "catalog streams influenced" },
  { target: 5, decimals: 0, suffix: "+", label: "countries reached" }
] as const;

export function AnimatedHeroMetrics() {
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }

    let frame = 0;
    let startedAt = 0;
    const duration = 1700;

    const animate = (timestamp: number) => {
      if (!startedAt) startedAt = timestamp;
      const elapsed = Math.min((timestamp - startedAt) / duration, 1);
      setProgress(1 - Math.pow(1 - elapsed, 3));
      if (elapsed < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={containerRef} className="mt-7 grid max-w-3xl grid-cols-2 gap-3 sm:mt-9 sm:grid-cols-3">
      {metrics.map(({ target, decimals, suffix, label }) => {
        const current = target * progress;
        return (
          <div key={label} className="border-l border-border pl-3 sm:pl-4">
            <p className="text-xl font-semibold tabular-nums text-white sm:text-2xl" aria-label={`${target}${suffix} ${label}`}>
              <span aria-hidden="true">{current.toFixed(decimals)}{suffix}</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] sm:text-xs sm:tracking-[0.18em]" style={{ color: "#8f97aa" }}>
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
