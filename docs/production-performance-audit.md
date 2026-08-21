# Production performance audit

## Code baseline (2026-08-22)

The audit found that customer-facing requests did not call DireNote directly, but
three avoidable request-time costs existed:

- Analytics refetched the same server-rendered report on mount and every 30 seconds.
- The customer workspace fetched beat-purchase data even when the Purchases and
  Support modules were never opened.
- Customer and admin release reads used Prisma's full `Release` model. That loads
  more columns than the screen needs and fails against the current production
  database, where optional DireNote columns have not been migrated yet.

The existing scheduled DireNote release worker also queried delivered/live records
on every run, and the monthly revenue worker had no durable per-ISRC reporting
period marker.

## Implemented execution model

| System | Trigger | Frequency | Stops when |
| --- | --- | --- | --- |
| Customer dashboard | Page request | On demand | Response is rendered; no external work starts |
| Analytics | Page request | On demand | Server-rendered verified report is displayed; no client polling |
| DireNote release status | Protected cron or admin-selected manual sync | Daily scheduled sweep; adaptive delays apply if a higher-frequency worker is configured | Release is rejected, fails, or requires manual action |
| DireNote revenue | Protected monthly cron or explicit admin request | Monthly scheduled sweep | A successful lookup for that ISRC is recorded for the reporting month |
| Reconciliation | Explicit admin operation / successful sync workflow | Event-driven | Persisted discrepancy records are read by the UI |
| Email | Business event | Event-driven | Existing idempotent email log records delivery outcome |
| Excel exports | Download request | On demand | Generation occurs only from the export route |

## Measurement still required in production

This repository cannot measure authenticated production TTFB, LCP, INP, CLS,
database query duration, or deployed bundle payload from source code alone. Before
and after deploying, capture those values in Vercel observability and browser
performance tooling for `/dashboard`, `/dashboard/releases`, `/analytics`, and
the admin distribution queue. The `test:performance-execution` check prevents
the key request-time regressions from returning.
