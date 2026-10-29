import type { Release } from '@/lib/types';
import { automationSummary, correctionReviewSummary } from '@/lib/distribution-workspace';
import { ShieldCheck } from 'lucide-react';
import styles from './distribution-operations.module.css';

export function DistributionAutomationInsight({ release }: { release: Release }) {
  const summary = automationSummary(release);
  const correction=correctionReviewSummary(release);
  const qc = release.metadata?.autoQc as { checkedAt?: string; checks?: { label: string; ready: boolean }[]; issues?: { field: string; message: string }[]; fixes?: { field: string; before: string; after: string }[]; revision?: string; changeKind?: string } | undefined;
  const checks=Array.isArray(qc?.checks)?qc.checks.filter(check=>check&&typeof check.label==='string'):[];
  const issues=Array.isArray(qc?.issues)?qc.issues.filter(issue=>issue&&typeof issue.field==='string'&&typeof issue.message==='string'):[];
  const fixes=Array.isArray(qc?.fixes)?qc.fixes.filter(fix=>fix&&typeof fix.field==='string'&&typeof fix.before==='string'&&typeof fix.after==='string'):[];
  return <section className={styles.insight} aria-label="Automatic QC evidence">
    <header><ShieldCheck size={18}/><strong>Automatic QC</strong><span data-tone={summary.tone}>{summary.label}</span></header>
    <p>{summary.detail}</p>
    {correction&&<p>{release.upcCode?`Existing provider UPC: ${release.upcCode}. `:''}HYMN review and provider review are separate. Approval and a fresh delivery acknowledgement are required before this corrected version is marked as sent.</p>}
    {typeof qc?.checkedAt==='string' && Number.isFinite(Date.parse(qc.checkedAt)) && <small>Checked {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(qc.checkedAt))} IST{typeof qc.changeKind==='string' ? ` / ${qc.changeKind.replaceAll('_', ' ')}` : ''}</small>}
    {!!checks.length && <div className={styles.checks}>{checks.map(check => <span key={check.label} data-ready={check.ready}>{check.ready ? '\u2713' : '\u2022'} {check.label}</span>)}</div>}
    {!!issues.length && <details><summary>Why this release is paused ({issues.length})</summary><ul>{issues.map((issue,index) => <li key={`${issue.field}-${index}`}><strong>{issue.field}</strong>: {issue.message}</li>)}</ul></details>}
    {!!fixes.length && <details><summary>Technical formatting fixes ({fixes.length})</summary><ul>{fixes.map(fix => <li key={fix.field}>{fix.field}: {fix.before} &rarr; {fix.after}</li>)}</ul></details>}
  </section>;
}
