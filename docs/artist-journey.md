# Artist journey and Team OS assistance

Customer entry: `/artist-journey`, linked from the studio home and beat licence panel. Team entry: Work-station → Artist success desk / activity → Artist journey.

## Customer controls

- Explicit goal, active/exploring/later state, optional target date, notes and up to five shortlisted public beats.
- Contact choice defaults to **ask first**. Calls require a usable account phone number and must fit the customer's timezone, weekdays and preferred hours as well as representative availability. An internal work slot is never a confirmed appointment.
- Listening/shopping insights are optional and disabled by default. Turning sharing off removes stored journey listening, licence, favourite and cart observations. Request/commitment/recap records remain available as service history.
- A customer can request help or a callback independently of proactive-contact settings. Duplicate requests use stable request keys.

## Signals and automation

The existing five-minute `team-os` job runs journey intake, source reconciliation and promise checks under the workspace lock. Intake is bounded and cursor-based; each generated work item has a unique workflow key. Customer help requests have a separate unconsumed-request scan so a busy representative or interrupted batch does not lose them.

Inputs: recent registrations, explicit help requests, shared playback/shopping activity, service interest, inactive release drafts (30 hours), release corrections, upcoming release requirements, and unfinished/failed checkouts (at least two hours old). Existing open call work is reused for the customer. Active note-taking sessions are left intact and retried later.

Listening uses audible playback intervals, excluding gaps/seeks and repeated interval overlap. Total playback and unique preview completion are separate. Heartbeats are bounded by wall time, sequence-deduplicated, authenticated, rate limited and checked against published beats. Playback is a browser-reported engagement signal, not proof of human attention or purchase intent.

Initial explainable scoring caps repeated event families, ignores observations older than 14 days and decays older scores. These weights are hypotheses, not validated conversion probabilities. Stronger browsing engagement can create an assistance activity, while actual contact still requires the relevant preference/request. A deterministic 5% comparison cohort receives observation-only behaviour activities; explicit requests, onboarding and service issues are always served.

Routing retains the existing contact owner where feasible and considers language, self-declared service strengths, scheduled minutes and outstanding work. Owners are excluded from automatic routing. Call slots use the existing reservation/leave/working-hours system plus customer-local windows. Reconciliation handles unavailable reps, changed preferences and resolved sources. Source truth is checked again at activity start, email queueing and activity-email delivery.

## Commitments and recaps

Promises identify who committed, deadline, revision and completion evidence. Automatic completion is restricted to selected verified HYMN records (a new beat purchase, selected release submission or audio presence). Customer-reported completion is distinct from team-verified completion. Overdue reminders are deduplicated per day and scanned in bounded batches.

Recaps contain reviewed customer-facing text and selected public beats, never a copy of internal notes. Publication creates a customer inbox notification and an authenticated customer-owned link. An active activity can prepare a standard HYMN email for a separate review/send step. Recap publication does not itself send email.

Records use the existing indexed `GrowthEvent` store, task context and workflow/audit tables. No schema migration is required. Journey choices do not overwrite onboarding preferences or activity drafts.

## Verification

```sh
node --import tsx scripts/verify-acquisition-isolated.ts --artist-journey-only
node scripts/verify-work-station-browser.cjs
node scripts/verify-artist-journey-browser.cjs
```

The isolated integration suite uses a disposable PostgreSQL database and disables email. Browser fixtures use mocked customer data. Neither sends customer mail.
