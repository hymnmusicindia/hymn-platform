# Team contact workflow

The shared directory is the entry point. Search before adding a person. The contact form groups identity, optional source evidence, and contact preferences; duplicate review and existing-account matching remain authoritative on the server.

Contacts & calls provides Source checks, Call queue, and All stages. Queue classification is shared in `lib/team/contact-queues.ts`:

- A source check is required when an active prospect has unchecked details or unverified outreach eligibility, including after an identity edit invalidates an older ready stage.
- Calls require checked details, consent or legitimate interest, and an assigned caller or scheduled follow-up. Closed and suppressed records are excluded.
- A source check is distinct from a verified lead. A verified lead still requires the existing conversation checklist and explicit confirmation.

The floating Assistance button offers permission-aware guides. Each guide navigates to its module and outlines a real control using stable `data-team-guide` attributes. Guidance never saves records, initiates calls, or sends messages. Missing or empty queues display an explanation instead of highlighting an unrelated record. Escape closes assistance and restores focus.

`scripts/grant-team-calling.ts --users=<verified IDs>` previews an operator grant. `--apply` adds CRM outreach and calendar permissions using a separate combined role, enables caller rotation, preserves existing preferences and duties, and writes an audit event. It does not change shifts or trigger outreach.

Validation: `scripts/verify-team-contact-intake.ts`, `scripts/verify-team-assistance-browser.cjs`, and the existing `scripts/verify-team-lead-stages-browser.cjs` cover queue eligibility, intake payloads, desktop/mobile guidance, and conversation confirmation.
