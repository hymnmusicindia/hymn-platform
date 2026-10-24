# Shared support inbox

Open `/dashboard?tab=support`, or use **Support inbox** in Team OS. Administrators with `services.manage`, active team owners, and active team members with `support.reply` or the existing `crm.outreach.manage` permission can read the shared inbox and reply. Other customers continue to see only their own tickets. No administrator session is issued to employees.

To grant another employee access, edit their team role and enable `support.reply`. Outreach staff already qualify. Revoked or inactive membership does not qualify. Support screenshot access uses the same check, restricted to screenshots attached to an existing ticket.

Expand a ticket and select **Reply to customer by email**. Choose a template, replace its placeholder, review the recipient and message, and confirm before sending. The existing durable outbox records delivery and holds uncertain sends for review rather than automatically resending.

Emails use the shared HYMN template and `/assets/hymnlogowhite.png`. The authenticated author's account name and active team job title are added to HTML and plain text. The configured administrator account named Aditya Ujjain receives the title “Founder, HYMN Music”; employees use their own identity. Legacy administrator sessions without an account identity use the HYMN Support signature.

Run `node scripts/verify-support-access.cjs` for route authorization and branded template checks.
