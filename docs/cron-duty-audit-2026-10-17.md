# HYMN scheduled-operations audit

Date: 17 October 2026. Scope: all 21 business cron endpoints, production startup,
Vercel schedules, GitHub fallback workflows, and their downstream queues.
Twenty endpoints are periodic duties; newsletter delivery is campaign-scoped.

## Outcome and reliability boundary

The implementation consolidates the existing fragmented triggers into one
registry (`lib/cron/jobs.json`), a Hostinger startup scheduler, durable endpoint
leases and run records, complete checked-in fallback coverage, and administrator
health reporting. It does not promise zero provider, SMTP, network or database
failures. It makes those failures detectable and prevents unsafe blind retries.

The existing production startup did schedule appointments, Team OS, playlist
reviews, studio automation and two email reminders. Vercel configuration alone
does not schedule a Hostinger deployment. GitHub covered a different subset.
The revised startup worker replaces those separate timers and covers all twenty
periodic duties, retaining their individual emergency-disable switches.

## Duty inventory and expected behaviour

Cadences below are target intervals, not exact-time guarantees. Jobs run once
after startup with staggering, then on interval; overdue domain work is queried
from persisted state. Vercel cron expressions are UTC. User call emails display
Asia/Kolkata times in AM/PM.

| Job | Primary cadence | Workflow and safety boundary |
| --- | --- | --- |
| team-appointments | 1 minute | Persisted call-message outbox → revision/assignment recheck → client confirmation, representative confirmation, client 30-minute reminder, representative 40-minute reminder → delivered/cancelled/review. Uncertain SMTP never auto-resends. |
| playlist-reviews | 15 minutes | Review deadlines and domain transitions/refund workflow; existing transaction and payment guards retained. |
| team-os | 15 minutes | Workspace-owner resolution → task/calendar workflow sync → deduplicated digests/reminders → client welcome queue. Calls use the dedicated minute worker. |
| studio-automation | 15 minutes | Verified payment recovery → project/revision deadlines → eligible studio follow-ups. Durable refund requests must not be inferred successful from a timeout. |
| direnote-release-sync | Hourly | Recover pending QC → guarded accepted-attempt lookup → authoritative status/identifier check → dated recording revisions → track-specific corrections/customer workflow. Never invent live status or re-ingest ambiguous delivery. |
| release-status-sync | Hourly | Due scheduled releases become awaiting-live-confirmation, not automatically live. Provider acceptance remains mandatory. |
| referral-reconciliation | Hourly | Qualification checks and referral mail with existing durable domain deduplication. Partial service failures propagate. |
| growth-sync | Hourly | Anti-join missing observations → release/payment/referral events → nudges. Existing event keys prevent replay duplication. |
| draft-reminders | Hourly | Customer-owned active drafts older than four days, never submitted → recheck eligibility → one attempt per draft and mailbox cooldown. Only eligible non-subscribers receive free-offer copy. |
| engineer-reminders | Hourly | Unpaid abandoned booking older than one day → active customer/listing/engineer recheck → one-time personalised follow-up. Never imply work starts before payment. |
| storage-cleanup | Hourly | Interrupted finalization recovery → expired temporary sessions → retention-expired assets. Interrupted EXPIRED claims are recoverable; failures are reported. |
| payment-reconciliation | Daily | Verified paid orders and purchases/licences, distribution fulfillment and subscription discrepancies → repair or admin review. Full-ledger scan remains potentially expensive at large scale; see operational limits. |
| gateway-finance | Daily | Current/prior India settlement months → pending route-transfer observations. Provider-confirmed facts only; transfer loop is budgeted. |
| spotify-artist-photos | Daily | Verified artist identity → photo lookup. Bounded fair ordering now records missing-image and failed attempts, so they cannot always lead the next batch. |
| birthday-notifications | Hourly | Existing UTC-date matching and per-user/year notification key. Hourly execution reduces missed daily-trigger risk; this does not replay birthdays from days the site was offline. |
| exchange-rate-refresh | Daily | Refresh only when the configured snapshot age is due. Failures do not fabricate a rate. |
| quarterly-payout-reset | Daily | Ensure current period; close an existing eligible prior period even if first-day execution was missed. No forced close, unmatched-row bypass, balance reset or invented historical period. |
| draft-nudges | Daily | Anti-join previously notified drafts before limiting; skip archived/inactive accounts; correct `?edit=` wizard link. |
| account-deletion-cleanup | Daily | Eligible scheduled-deletion records → atomic status/deadline/no-appeal recheck → anonymization/session removal/profile disable/audit in one transaction. Retained financial/legal records are unchanged. |
| direnote-revenue-sync | Hourly | Fair least-recently-checked ISRC batches; successful reports wait 24 hours, failures cool down. Import fingerprints remain authoritative. No partner USD settlement is treated as a customer wallet payment. |
| newsletter-campaign | Explicit campaign request | Campaign-token/cron authentication → per-campaign lease → bounded recipients/cursor progress. A queued interrupted SMTP attempt stops for review rather than generating an automatic retry key. Not a general automatic mailing job. |

## Shared execution architecture

```text
Hostinger startup worker ─┐
GitHub fallback jobs ─────┼→ authenticated endpoint → durable job lease
Vercel (if hosted there) ─┘        → durable START record → guarded domain work
                                  → FINISH record + truthful HTTP outcome
                                  → owned lease release
Independent watchdog → authenticated read-only health → failed workflow alert
Admin release-status panel → role-protected health details and review counts
```

- Bearer authentication fails closed before DB access; comparison is timing-safe.
- All twenty periodic routes use the shared runtime. Existing narrower release,
  playlist and studio leases remain intact. The shared lease lasts ten minutes,
  longer than the existing route execution budgets. Exception paths release only
  their own run's lease; crashed processes recover by expiry.
- The runtime does not race a timeout and then release a lease while business work
  continues. Services own their bounded I/O and loop deadlines. A client timeout
  is not cancellation or proof of business failure.
- Hostinger has one bulk lane and a separate appointment lane. Retry backoff and
  jitter reduce synchronized overload; Retry-After is honored when returned.
  Redirects are rejected so the cron secret is not forwarded to another origin.
- HTTP 200 is not sufficient health: nested errors, failed counts, unresolved
  issues and REVIEW outcomes propagate as HTTP 503. Response/domain details stay
  available while run records store only operational metadata, not customer
  recipient lists or provider payloads.
- Health distinguishes running, healthy, disabled, never observed, stale,
  interrupted and attention-needed jobs. A START without a matching FINISH after
  lease expiry is not hidden behind an older successful run. Lease/age checks use
  database time, avoiding application/database timezone comparison errors.
- Admin health includes appointment/client-introduction review queues, uncertain
  email attempts, recent failed email attempts and open financial review tasks.
  Historic failed attempts can still require human interpretation; a failed log
  alone is not proof that the recipient received nothing.
- GitHub fallback calls every registered periodic duty, not just release sync.
  A separate watchdog calls `/api/cron/health`; failure fails the workflow. Repo
  maintainers must enable/watch GitHub Actions failure notifications for alert
  delivery. No new paid infrastructure was purchased or provisioned.

## Read-only live evidence

`scripts/audit-cron-live.ts .env.hostinger` was run without invoking jobs, sending
mail, importing money, deleting accounts or removing files:

- No shared CRON_RUN_FINISHED records yet: the new runtime was not deployed at
  inspection time.
- Latest three DireNote run records were completed-with-errors, with 3, 3 and 4
  errors respectively. This is historical run evidence, not a new live failure
  introduced by this audit.
- Appointment queue: 4 PENDING, 9 SENT, 1 SENDING, 6 CANCELLED. A SENDING row is
  not declared failed without checking its age and delivery log.
- Client introductions: 4 SENT.
- Email history: 268 SENT, 59 FAILED, 1 QUEUED, 36 SKIPPED, 31 DRAFT. These are
  historical log counts, not a count of distinct undelivered customers. No bulk
  resend was attempted.

## Verification and operating checklist

1. Run `node --import tsx scripts/verify-cron-domain.ts` for registry/fallback
   coverage, result classification, runner validation and lane isolation.
2. Run `node --import tsx scripts/verify-direnote-virtual.ts --cron-only --build`
   for a production build and isolated PostgreSQL checks of auth, durable runs,
   leases, exception/partial failure handling, draft links/dedup, appeal safety,
   first-100 revenue starvation, ambiguous newsletter delivery and interrupted
   heartbeat detection.
3. Retain the DireNote lifecycle suite and manual-cron UI/authorization suites.
4. Deploy through the existing production database preflight and `npm start`.
   `CRON_SECRET` must match deployment and repository secrets. SMTP/provider keys
   remain server-only. `HYMN_CRON_WORKER_ENABLED=false` disables the primary
   worker and requires external coverage; per-job flags remain respected.
5. Check the administrator's Automation health panel after deployment and one
   complete scheduling cycle. Verify actual Actions execution and notifications;
   merely committing workflows does not verify installed secrets or deployment.
6. Review uncertain financial/SMTP outcomes against provider evidence before
   manually retrying. Never force successful state to make a dashboard green.

## Operational limits and next capacity decisions

No application timer runs while every application instance is down. GitHub is a
best-effort fallback and can itself delay/drop scheduled executions. For tighter
appointment SLAs and an independent uptime guarantee, configure a dedicated
external minute scheduler/monitor with its own availability boundary. That
requires account/configuration choices and was not silently provisioned.

The payment reconciliation service still reads full order history; quarter report
generation and some provider pagination can be expensive at large scale. The
shared leases and health records contain/report these failures but do not turn
those services into distributed queues. Capacity tests, durable partition cursors
and suitable provider quotas are required before claiming enterprise-scale
throughput. Email-specific transaction paths retain their existing bounded
account locks; an SMTP acceptance cannot be made atomic with a DB transaction.
Exactly-once external delivery is therefore not promised.

Legacy source-string performance assertions were refreshed to inspect the actual
provider-state filter, required optimistic-concurrency timestamps and the
submission-success gate before marking a queue sent. No release behaviour was
changed merely to satisfy an outdated comment/string expectation.

## Research basis

- [Google Cloud Scheduler delivery semantics](https://docs.cloud.google.com/scheduler/docs/overview): scheduled delivery is at least once; handlers must be idempotent.
- [GitHub scheduled-workflow behaviour](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): schedules can be delayed or dropped; GitHub alone is not a minute-accurate reminder SLA.
- [AWS retry/backoff guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html): bounded retries/backoff and idempotency protect overloaded dependencies.
- [PostgreSQL advisory locking](https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS): lock scope matters; short transactional coordination plus durable HTTP-spanning leases is retained.
