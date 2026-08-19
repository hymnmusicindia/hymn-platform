"use client";


import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform
} from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarCheck2,
  Disc3,
  Megaphone,
  Palette,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Users2
} from "lucide-react";
import type { CSSProperties, PointerEvent } from "react";
import type { LucideIcon } from "lucide-react";

type ServiceInput = {
  title: string;
  body: string;
};

type ServiceTheme = {
  accent: string;
  gradient: string;
  glow: string;
  icon: LucideIcon;
  stat: string;
  statLabel: string;
};

type EnrichedService = ServiceInput & {
  theme: ServiceTheme;
};

const serviceThemes: Record<string, ServiceTheme> = {
  "Music Distribution": {
    accent: "#34d399",
    gradient: "radial-gradient(circle at 18% 18%, rgba(52,211,153,0.34), transparent 30%), linear-gradient(135deg, rgba(52,211,153,0.20), rgba(59,130,246,0.08))",
    glow: "rgba(52,211,153,0.34)",
    icon: Disc3,
    stat: "150+",
    statLabel: "platforms"
  },
  "Artist Management": {
    accent: "#f5c16c",
    gradient: "radial-gradient(circle at 18% 18%, rgba(245,193,108,0.34), transparent 30%), linear-gradient(135deg, rgba(245,193,108,0.18), rgba(255,255,255,0.07))",
    glow: "rgba(245,193,108,0.34)",
    icon: Users2,
    stat: "24/7",
    statLabel: "visibility"
  },
  "Label Services": {
    accent: "#a78bfa",
    gradient: "radial-gradient(circle at 18% 18%, rgba(167,139,250,0.34), transparent 30%), linear-gradient(135deg, rgba(167,139,250,0.20), rgba(236,72,153,0.08))",
    glow: "rgba(167,139,250,0.34)",
    icon: Building2,
    stat: "10x",
    statLabel: "ops clarity"
  },
  "Playlist Promotion": {
    accent: "#f472b6",
    gradient: "radial-gradient(circle at 18% 18%, rgba(244,114,182,0.34), transparent 30%), linear-gradient(135deg, rgba(244,114,182,0.20), rgba(251,113,133,0.08))",
    glow: "rgba(244,114,182,0.34)",
    icon: Radio,
    stat: "+42%",
    statLabel: "discovery lift"
  },
  "Music Marketing": {
    accent: "#fb923c",
    gradient: "radial-gradient(circle at 18% 18%, rgba(251,146,60,0.34), transparent 30%), linear-gradient(135deg, rgba(251,146,60,0.20), rgba(245,193,108,0.08))",
    glow: "rgba(251,146,60,0.34)",
    icon: Megaphone,
    stat: "3.6x",
    statLabel: "content velocity"
  },
  "Branding & Creative": {
    accent: "#fbbf24",
    gradient: "radial-gradient(circle at 18% 18%, rgba(251,191,36,0.32), transparent 30%), linear-gradient(135deg, rgba(251,191,36,0.18), rgba(52,211,153,0.07))",
    glow: "rgba(251,191,36,0.32)",
    icon: Palette,
    stat: "360",
    statLabel: "brand system"
  },
  "YouTube Monetization": {
    accent: "#ef4444",
    gradient: "radial-gradient(circle at 18% 18%, rgba(239,68,68,0.34), transparent 30%), linear-gradient(135deg, rgba(239,68,68,0.20), rgba(255,255,255,0.06))",
    glow: "rgba(239,68,68,0.34)",
    icon: Play,
    stat: "100%",
    statLabel: "claim posture"
  },
  "Release Strategy": {
    accent: "#fb7185",
    gradient: "radial-gradient(circle at 18% 18%, rgba(251,113,133,0.34), transparent 30%), linear-gradient(135deg, rgba(251,113,133,0.20), rgba(167,139,250,0.08))",
    glow: "rgba(251,113,133,0.34)",
    icon: CalendarCheck2,
    stat: "45d",
    statLabel: "rollout window"
  },
  "Rights Management": {
    accent: "#60a5fa",
    gradient: "radial-gradient(circle at 18% 18%, rgba(96,165,250,0.34), transparent 30%), linear-gradient(135deg, rgba(96,165,250,0.20), rgba(34,211,238,0.08))",
    glow: "rgba(96,165,250,0.34)",
    icon: ShieldCheck,
    stat: "0",
    statLabel: "messy splits"
  },
  "Analytics & Insights": {
    accent: "#22d3ee",
    gradient: "radial-gradient(circle at 18% 18%, rgba(34,211,238,0.34), transparent 30%), linear-gradient(135deg, rgba(34,211,238,0.20), rgba(59,130,246,0.08))",
    glow: "rgba(34,211,238,0.34)",
    icon: BarChart3,
    stat: "5+",
    statLabel: "markets tracked"
  }
};

const fallbackTheme: ServiceTheme = {
  accent: "#f4f7fb",
  gradient: "radial-gradient(circle at 18% 18%, rgba(244,247,251,0.24), transparent 30%), linear-gradient(135deg, rgba(244,247,251,0.14), rgba(89,223,224,0.07))",
  glow: "rgba(244,247,251,0.24)",
  icon: Sparkles,
  stat: "1",
  statLabel: "connected system"
};

function enrichServices(services: ServiceInput[]): EnrichedService[] {
  return services.map((service) => ({
    ...service,
    theme: serviceThemes[service.title] ?? fallbackTheme
  }));
}

function normalizeLoop(value: number, width: number) {
  if (width <= 0) return 0;
  return ((value % width) + width) % width;
}

function ServiceIcon({ service, reducedMotion }: { service: EnrichedService; reducedMotion: boolean }) {
  const Icon = service.theme.icon;
  const title = service.title;

  if (title === "Music Distribution") {
    return (
      <motion.span animate={reducedMotion ? undefined : { rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }}>
        <Icon className="h-8 w-8" />
      </motion.span>
    );
  }

  if (title === "Analytics & Insights") {
    return (
      <span className="flex h-8 w-8 items-end justify-center gap-1">
        {[15, 24, 18, 30].map((height, index) => (
          <motion.span
            key={height}
            className="w-1.5 rounded-full"
            style={{ backgroundColor: service.theme.accent }}
            animate={reducedMotion ? undefined : { height: [height * 0.55, height, height * 0.72] }}
            transition={{ duration: 1.5, delay: index * 0.12, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </span>
    );
  }

  if (title === "Playlist Promotion") {
    return (
      <motion.span animate={reducedMotion ? undefined : { scale: [1, 1.08, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}>
        <Icon className="h-8 w-8" />
      </motion.span>
    );
  }

  if (title === "Rights Management") {
    return (
      <motion.span animate={reducedMotion ? undefined : { opacity: [0.78, 1, 0.78] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}>
        <Icon className="h-8 w-8" />
      </motion.span>
    );
  }

  if (title === "Branding & Creative") {
    return (
      <motion.span animate={reducedMotion ? undefined : { rotate: [0, 7, -5, 0], scale: [1, 1.06, 1] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}>
        <Icon className="h-8 w-8" />
      </motion.span>
    );
  }

  if (title === "Release Strategy") {
    return (
      <motion.span animate={reducedMotion ? undefined : { rotateX: [0, 16, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}>
        <Icon className="h-8 w-8" />
      </motion.span>
    );
  }

  return (
    <motion.span animate={reducedMotion ? undefined : { scale: [1, 1.045, 1] }} transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}>
      <Icon className="h-8 w-8" />
    </motion.span>
  );
}

function ServiceCard({ service, index }: { service: EnrichedService; index: number }) {
  const reducedMotion = useReducedMotion();
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(45);
  const rotateX = useSpring(useTransform(pointerY, [0, 100], [4, -4]), { stiffness: 180, damping: 24 });
  const rotateY = useSpring(useTransform(pointerX, [0, 100], [-5, 5]), { stiffness: 180, damping: 24 });
  const sheen = useMotionTemplate`radial-gradient(circle at ${pointerX}% ${pointerY}%, rgba(255,255,255,0.20), transparent 32%)`;

  const resetPointer = useCallback(() => {
    pointerX.set(50);
    pointerY.set(45);
  }, [pointerX, pointerY]);

  return (
    <motion.article
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ type: "spring", stiffness: 120, damping: 22, delay: (index % 10) * 0.08 }}
      whileHover={reducedMotion ? undefined : { y: -10, scale: 1.025 }}
      onPointerMove={(event: PointerEvent<HTMLElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        pointerX.set(((event.clientX - rect.left) / rect.width) * 100);
        pointerY.set(((event.clientY - rect.top) / rect.height) * 100);
      }}
      onPointerLeave={resetPointer}
      className="group/service-card relative h-[23rem] w-[78vw] shrink-0 overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[0.055] p-5 text-white shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-2xl transition-[filter] duration-500 sm:h-[24rem] sm:w-[22rem] md:w-[23rem] lg:w-[24rem] xl:w-[25rem]"
      style={
        {
          rotateX: reducedMotion ? 0 : rotateX,
          rotateY: reducedMotion ? 0 : rotateY,
          transformStyle: "preserve-3d",
          background: `linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.035)), ${service.theme.gradient}`,
          boxShadow: `0 28px 100px rgba(0,0,0,0.34), 0 0 58px ${service.theme.glow}`,
          "--service-accent": service.theme.accent
        } as CSSProperties
      }
    >
      <motion.div className="absolute inset-0 opacity-0 transition duration-500 group-hover/service-card:opacity-100" style={{ background: sheen }} />
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-70" />
      <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full blur-3xl transition duration-500 group-hover/service-card:opacity-100" style={{ backgroundColor: service.theme.glow }} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.065),transparent_34%,rgba(0,0,0,0.18))]" />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <motion.span
            whileHover={reducedMotion ? undefined : { rotate: -4, scale: 1.1 }}
            className="inline-flex h-14 w-14 items-center justify-center rounded-[1.1rem] border border-white/14 bg-black/24 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
            style={{ color: service.theme.accent }}
          >
            <ServiceIcon service={service} reducedMotion={Boolean(reducedMotion)} />
          </motion.span>
        </div>

        <div className="mt-5">
          <p className="text-sm font-semibold" style={{ color: service.theme.accent }}>{service.theme.stat} {service.theme.statLabel}</p>
          <h3 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.02em] text-white">{service.title}</h3>
          <p className="mt-3 text-sm leading-6 text-white/68">{service.body}</p>
        </div>

        <div className="mt-auto">
          <a
            href="/services"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/22 px-5 py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition duration-300 group-hover/service-card:border-white/20"
          >
            <span style={{ color: service.theme.accent }}>Learn More</span>
            <ArrowRight className="h-4 w-4 transition duration-300 group-hover/service-card:translate-x-1" />
          </a>
        </div>
      </div>
    </motion.article>
  );
}

function ServiceCarousel({ services }: { services: EnrichedService[] }) {
  const reducedMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const resumeTimerRef = useRef<any>(null);
  const loopWidthRef = useRef(0);
  const offsetRef = useRef(0);
  const speedRef = useRef(0.018);
  const draggingRef = useRef(false);
  const x = useMotionValue(0);
  const [paused, setPaused] = useState(false);
  const doubledServices = useMemo(() => [...services, ...services], [services]);

  const measureLoop = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    loopWidthRef.current = track.scrollWidth / 2;
    offsetRef.current = normalizeLoop(offsetRef.current, loopWidthRef.current);
    x.set(-offsetRef.current);
  }, [x]);

  useLayoutEffect(() => {
    measureLoop();
  }, [measureLoop, services.length]);

  useEffect(() => {
    window.addEventListener("resize", measureLoop);
    return () => window.removeEventListener("resize", measureLoop);
  }, [measureLoop]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const pause = useCallback(() => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    setPaused(true);
  }, []);

  const resumeAfter = useCallback((delay = 350) => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => setPaused(false), delay);
  }, []);

  useMotionValueEvent(x, "change", (latest) => {
    if (paused) {
      offsetRef.current = normalizeLoop(-latest, loopWidthRef.current);
    }
  });

  useAnimationFrame((_, delta) => {
    if (reducedMotion || draggingRef.current || loopWidthRef.current <= 0) return;
    const targetSpeed = paused ? 0 : 0.018;
    const easing = Math.min(1, delta / (paused ? 420 : 720));
    speedRef.current += (targetSpeed - speedRef.current) * easing;
    if (paused && speedRef.current < 0.0001) return;
    offsetRef.current = normalizeLoop(offsetRef.current + delta * speedRef.current, loopWidthRef.current);
    x.set(-offsetRef.current);
  });

  const handleDragEnd = useCallback(() => {
    draggingRef.current = false;
    offsetRef.current = normalizeLoop(-x.get(), loopWidthRef.current);
    x.set(-offsetRef.current);
    resumeAfter(2600);
  }, [resumeAfter, x]);

  return (
    <div
      className="relative mt-10 overflow-x-clip overflow-y-visible py-10 [mask-image:linear-gradient(90deg,transparent_0%,black_7%,black_93%,transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,transparent_0%,black_7%,black_93%,transparent_100%)]"
      onMouseEnter={pause}
      onMouseLeave={() => resumeAfter(450)}
      onTouchStart={pause}
      onTouchEnd={() => resumeAfter(2600)}
      onTouchCancel={() => resumeAfter(2600)}
    >
      <motion.div
        ref={trackRef}
        className="flex cursor-grab gap-4 px-4 active:cursor-grabbing sm:gap-5 sm:px-8 lg:gap-6"
        style={{ x, willChange: "transform" }}
        drag={reducedMotion ? false : "x"}
        dragMomentum={false}
        dragElastic={0.025}
        onDragStart={() => { draggingRef.current = true; speedRef.current = 0; pause(); }}
        onDragEnd={handleDragEnd}
      >
        {doubledServices.map((service, index) => (
          <ServiceCard key={`${service.title}-${index}`} service={service} index={index} />
        ))}
      </motion.div>
    </div>
  );
}

export function ServicesEcosystem({ services }: { services: ServiceInput[] }) {
  const enriched = useMemo(() => enrichServices(services), [services]);
  const mouseX = useMotionValue(50);
  const mouseY = useMotionValue(45);
  const spotlight = useMotionTemplate`radial-gradient(circle at ${mouseX}% ${mouseY}%, rgba(255,255,255,0.17), transparent 30%)`;

  return (
    <section
      id="offerings"
      className="force-dark relative overflow-hidden py-12 text-white sm:py-16 lg:py-24"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        mouseX.set(((event.clientX - rect.left) / rect.width) * 100);
        mouseY.set(((event.clientY - rect.top) / rect.height) * 100);
      }}
    >
      <div className="absolute inset-0 bg-[#05070b]" />
      <div className="absolute inset-0 opacity-80 [background-image:radial-gradient(circle_at_18%_20%,rgba(124,58,237,0.26),transparent_30%),radial-gradient(circle_at_78%_18%,rgba(34,211,238,0.20),transparent_26%),radial-gradient(circle_at_54%_86%,rgba(185,28,28,0.20),transparent_34%)]" />
      <motion.div className="absolute inset-0" style={{ background: spotlight }} />
      <div className="absolute inset-0 opacity-[0.075] [background-image:linear-gradient(rgba(255,255,255,0.42)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.42)_1px,transparent_1px)] [background-size:58px_58px]" />
      <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.8)_0_1px,transparent_1px)] [background-size:36px_36px]" />
      <svg className="pointer-events-none absolute inset-x-0 bottom-8 h-48 w-full opacity-[0.10]" viewBox="0 0 1400 220" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 118 C 90 82 140 82 230 118 S 370 154 460 118 600 82 690 118 830 154 920 118 1060 82 1150 118 1290 154 1400 118" fill="none" stroke="white" strokeWidth="1.2" />
        <path d="M0 148 C 110 104 160 104 270 148 S 430 192 540 148 700 104 810 148 970 192 1080 148 1240 104 1400 148" fill="none" stroke="white" strokeWidth="0.9" />
      </svg>

      <div className="shell relative">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.985 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
          className="max-w-4xl"
        >
          <h2 className="max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
            Everything an artist needs after the song is finished.
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
            A premium service carousel for the systems that release, promote, protect, monetize, and measure a modern artist career.
          </p>
        </motion.div>

        <ServiceCarousel services={enriched} />
      </div>
    </section>
  );
}

// vercel trigger 2

// vercel trigger 3
