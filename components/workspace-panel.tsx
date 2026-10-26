import type { ReactNode } from "react";

/** Shared module anatomy for every workspace: heading, description, then content. */
export function WorkspacePanel({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="surface-card dashboard-module-panel" data-ui="panel">
    <header className="dashboard-module-heading"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{actions}</header>
    <div className="dashboard-module-body">{children}</div>
  </section>;
}

export function WorkspaceMetric({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return <div className="metric-card dashboard-stat-card h-full" data-ui="metric"><p className="dashboard-metric-label">{label}</p><p className="dashboard-metric-value">{value}</p>{detail ? <p className="dashboard-metric-detail">{detail}</p> : null}</div>;
}
