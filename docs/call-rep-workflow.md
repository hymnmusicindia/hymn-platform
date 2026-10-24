# Call representative workflow

The Customer callbacks queue now supports three independent jobs:

- **Add a footnote / reschedule:** save task context without recording a contact attempt, or move the reserved callback slot. The task, calendar reservation, comment history and audit trail are updated in one transaction.
- **Record outcome & schedule next step:** record what happened during a real call and apply the existing retry and completion rules.
- **Edit contact details:** open the linked shared contact card directly to correct names, numbers, emails, location or interests.

Footnotes are visible with the assigned task. Existing contact-card private notes retain their owner/manager access rules. Representatives can add task footnotes even when the contact card belongs to another teammate. Blocked callbacks accept notes but still require review before further outreach. Rescheduling validates future time, calling windows and calendar conflicts. It does not imply that the customer confirmed an appointment.

Search filters loaded callbacks by name, number, email or task title. Failed submissions retain input; successful submissions show a status message. All scheduling fields explicitly use IST.

## Research informing the design

Reviewed 24 October 2026:

- [NN/g: Website Forms Usability](https://www.nngroup.com/articles/web-form-design/) recommends reducing unnecessary input and grouping related fields. Notes/planning are separated from actual call outcomes so a representative does not have to report a fictional call to save context.
- [NN/g: Reporting Errors in Forms](https://www.nngroup.com/articles/errors-forms-design-guidelines/) informs actionable errors and preserving entered input on failed saves.
- [GOV.UK: Confirmation pages](https://design-system.service.gov.uk/patterns/confirmation-pages/) establishes the need to clearly confirm completed actions. Lightweight in-place status messages fit this repeated operational workflow.

## Validation

`npm run test:contact-merge` exercises isolated PostgreSQL integration checks, including representative note saves, stale versions, another representative's access, invalid scheduling, calendar sync, shared identity edits and private-note preservation.

`node scripts/verify-call-rep-ui.cjs` runs Chromium component interaction checks at a mobile viewport, covering failure recovery, note saves, IST conversion, the contact edit link and search. The harness substitutes the API and Next Link; it does not verify live authentication, deployment or the full workspace layout.
