# Team OS Work-station

Work-station is the default team execution surface. Today, overdue, upcoming and finished work share one queue. Customer tickets can be opened directly into an accountable activity. Old My Work, All Work, Customer callbacks and Release QC URLs resolve to the same surface and retain task deep links.

## Staff workflow

1. Open an assigned task or customer ticket, or choose Manual activity. Search existing contacts before adding a new one.
2. Start the activity. The timer measures activity time, not connected telephone time. The rep makes the call using their personal or business phone; opening a telephone/WhatsApp link records no successful contact.
3. Write live notes, needs, commitments and next actions; select service interests and complete the task checklist. Drafts autosave after two seconds. An unsaved local backup is scoped to workspace, teammate, task and session. Pause before leaving; resume performs a fresh concurrency check.
4. Record the real outcome. Reports are appended to shared contact history with teammate identity, role, start/end time and duration. Legacy reports remain readable and append-only amendments remain available.

Ticket context, attachments, replies, reviewed email templates, QC and lead qualification tools are available beside the report. Phone-request and solution emails use the existing HYMN support outbox and identify the responsible teammate. Email status is queued/sent/review, never presented as guaranteed delivery. A ticket may be closed with a completed resolution report; this also resolves its administrative queue item. An approval-required task still requires independent approval.

## Supervisor rules

- One running activity per teammate and contact, enforced inside the existing workspace transaction lock. Paused sessions retain drafts; resuming cannot overlap another running session.
- No-answer/busy outcomes propose the next free declared working-hours slot, normally after 24 hours. Manual requests must be future times; unavailable customer-requested slots require coverage review rather than silently moving the appointment.
- Three consecutive unanswered attempts block further automatic contact. Wrong-number and do-not-contact outcomes are separate; do-not-contact stops call work and preserves unrelated tasks.
- A missed-call email is queued only after recording an actual unanswered attempt. The rolling two-hour cooldown applies across this contact's Work-station tasks. Transactional ticket replies and eligible contact outreach use their existing separate delivery pipelines and consent checks.
- Missing phone numbers permit ticket investigation and a reviewed phone-request email. They cannot produce a fictional call result. An email resolution may close the ticket without claiming a telephone conversation.
- Ticket routing runs in the existing Team OS cron, in the primary support workspace, using active authorised employees, workload and available working hours. Twenty tickets are inspected per cursor batch. Uncovered tickets stay visible for manual handling and subsequent sweeps. Stable event keys prevent duplicate intake.
- Missing-coverage retries are reconsidered when working hours become available. Attempt limits and explicitly requested unavailable times remain supervisor exceptions.
- Managers can release an abandoned session with a reason; its draft remains in the immutable audit evidence. Assignment/status changes cannot silently overwrite an active session.
- Completing an activity does not publish releases or beats, approve creator applications, grant financial authority or satisfy daily CRM targets by checkbox. Existing source decisions, dependency/checklist checks, review rules and recurrence continue to apply. Real eligible conversations feed the existing CRM contact metrics.
- An owner may opt into a personal call plan capped at three or four tasks per India workday. It reassigns only unstarted friendly-introduction calls with a valid customer phone, skips internal identities and restricted contacts, and records the previous owner in the audit log. It never places a call or sends an email. An opted-in owner can take a task that was previously pinned to another teammate; the daily and outstanding-work caps still apply.

## Storage and recovery

The current session is stored in `TeamTask.followUpContext.workActivity`. Final client reports use `TeamAudit` (`contact.call_report` / `contact.activity_report`). No schema migration or second task database is introduced. Task versions reject stale saves. A reload-and-recover action inside the modal restores newer unsaved local notes. Local backups are removed on successful persistence or completion. Draft notes are available only through authorised task access; private contact notes are excluded from activity history.

Manual ticket mail uses a stable namespaced request key and rejects changed content on the same key. Delivery workers retain their existing uncertain-delivery review flow; the system does not blindly resend mail whose delivery is unknown. No customer emails are generated by merely opening the queue, starting a session or running ticket intake.

## Validation

- `npm run test:work-station`: disposable PostgreSQL; access/privacy, concurrent sessions, stale saves, pause/resume, retries, two-hour email cooldown, phone requests, ticket closure, recurrence, independent review, source CRM metrics, coverage recovery, intake deduplication; includes shared-report and leadership regressions. SMTP is disabled.
- `npm run test:work-station:browser`: full global styles plus component styles, light/dark at 1440/768/390/320 pixels; autosave, timer, pause/reopen, call outcomes, ticket templates and closure, contact lookup and overflow.
- Existing call-report browser and assistance regressions cover retained history/amendments and updated guidance. TypeScript and the theme contract are checked separately.

## Design references

The contextual activity layout follows the established agent-workspace pattern of keeping customer context and conversation tools together: [Zendesk Agent Workspace](https://support.zendesk.com/hc/en-us/articles/4408821259930-About-the-Zendesk-Agent-Workspace/). Shared client timelines and structured outcomes are informed by [HubSpot's activity logging](https://knowledge.hubspot.com/records/manually-log-activities-on-records?tab=tab-crm) and [call outcome documentation](https://knowledge.hubspot.com/calling/create-custom-call-and-meeting-outcomes?isappinstalled=0). HYMN retains its own theme tokens, permissions, scheduling and business rules.
