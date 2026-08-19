"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Info, RefreshCw, TriangleAlert } from "lucide-react";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function DashboardShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`hymn-dashboard-shell ${className}`.trim()}>{children}</main>;
}

export function PageHeader({ eyebrow, title, description, action, meta }: { eyebrow?: string; title: string; description?: string; action?: ReactNode; meta?: ReactNode }) {
  return <header className="hymn-page-header"><div className="min-w-0">{eyebrow ? <p className="hymn-kicker">{eyebrow}</p> : null}<h1 className="hymn-page-title">{title}</h1>{description ? <p className="hymn-page-description">{description}</p> : null}{meta ? <div className="hymn-page-meta">{meta}</div> : null}</div>{action ? <div className="hymn-page-action">{action}</div> : null}</header>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="hymn-section-header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action}</div>;
}

export function StatusBadge({ children, tone = "neutral", dot = true }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return <span className={`hymn-status-badge hymn-status-${tone}`}>{dot ? <span className="hymn-status-dot" aria-hidden="true" /> : null}<span>{children}</span></span>;
}

export function DataSourceBadge({ source, period }: { source: string; period?: string | null }) {
  return <span className="hymn-source-badge"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Verified <span aria-hidden="true">•</span> {source}{period ? <><span aria-hidden="true">•</span> {period}</> : null}</span>;
}

export function EmptyState({ title, description, action, secondaryAction, illustration }: { title: string; description: string; action?: { label: string; href: string }; secondaryAction?: { label: string; href: string }; illustration?: ReactNode }) {
  return <section className="hymn-state-panel"><div className="hymn-state-illustration" aria-hidden="true">{illustration ?? <span className="hymn-empty-wave"><i /><i /><i /><i /><i /></span>}</div><h2>{title}</h2><p>{description}</p>{action || secondaryAction ? <div className="mt-5 flex flex-wrap justify-center gap-3">{action ? <Link className="btn-primary" href={action.href}>{action.label}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link> : null}{secondaryAction ? <Link className="btn-outline" href={secondaryAction.href}>{secondaryAction.label}</Link> : null}</div> : null}</section>;
}

export function ErrorState({ title = "Something went wrong", description, retry }: { title?: string; description: string; retry?: () => void }) {
  return <section className="hymn-state-panel" role="alert"><AlertCircle className="h-7 w-7 text-[var(--error)]" aria-hidden="true" /><h2>{title}</h2><p>{description}</p>{retry ? <button className="btn-outline mt-5" type="button" onClick={retry}><RefreshCw className="h-4 w-4" aria-hidden="true" />Try again</button> : null}</section>;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`hymn-skeleton ${className}`.trim()} aria-hidden="true" />;
}

export function LoadingState({ label = "Loading your workspace" }: { label?: string }) {
  return <section className="hymn-loading-panel" aria-live="polite" aria-busy="true"><span className="sr-only">{label}</span><Skeleton className="h-4 w-28" /><Skeleton className="mt-4 h-8 w-2/3" /><Skeleton className="mt-3 h-4 w-full" /><div className="mt-6 grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div></section>;
}

export function InlineAlert({ tone = "info", title, children }: { tone?: Exclude<Tone, "neutral">; title: string; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? TriangleAlert : tone === "danger" ? AlertCircle : Info;
  return <div className={`hymn-inline-alert hymn-alert-${tone}`} role={tone === "danger" ? "alert" : "status"}><Icon className="h-5 w-5 shrink-0" aria-hidden="true" /><div><strong>{title}</strong><div>{children}</div></div></div>;
}

export function MoneyDisplay({ amount, currency = "INR", label, detail }: { amount: number; currency?: string; label?: string; detail?: string }) {
  const value = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  return <div className="hymn-money-display">{label ? <span>{label}</span> : null}<strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>;
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="hymn-filter-bar" role="search">{children}</div>;
}

// vercel trigger 11
