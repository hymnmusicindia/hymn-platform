# Team email consolidation

Routine Team OS email is one weekly performance/work summary per active member and workspace, due Monday at 09:00 Asia/Kolkata. It combines performance, targets, commissions, outstanding work and the member's assigned calls/callbacks for the next seven days, with links to the full report and current calendar. Existing per-member/per-week event keys and atomic delivery claims prevent duplicate cron sends.

Daily report emails are no longer queued. The delivery worker cancels legacy pending daily reports and outdated weekly reports rather than sending a backlog. Generic email retries cannot bypass this policy. Daily performance views remain available in Team OS.

Staff call/callback assignment emails are no longer queued. Scheduled staff reminders still generate their deduplicated in-app notification, then finish without SMTP. Legacy queued staff appointment emails are suppressed too, and manual retries are blocked. Calendar assignments, handoff and customer appointment confirmation/reminder emails remain operational. Owner-authorised briefings, invitations and essential account emails are separate from routine reporting.

Run `npm run test:team-mail-policy` for isolated PostgreSQL coverage of weekly report deduplication, assigned-call summaries, legacy daily suppression, inactive recipients, in-app reminders, staff email suppression, customer emails, call handoff and retry safety. SMTP is disabled; tests inject fake delivery functions. TypeScript and targeted lint checks also apply.

The runtime policy takes effect when this revision is deployed; already-sent messages cannot be recalled.
