# Branded manual emails

Open `/admin/email-logs` with `system.manage` permission. Choose Blank message or Release under review. Edit the recipient, subject, heading and greeting; add and reorder paragraphs, information boxes and buttons. Button labels and full HTTP(S) URLs are editable. Save/load an unfinished draft on the current browser. Preview renders the exact server template; editing invalidates that preview before sending. A draft request ID prevents a repeat click from sending the same message twice. Delivery outcomes appear in Email logs.

The shared HYMN template uses the catalogue email's black logo header, white content card, muted information box, dark action button and support footer. Content is escaped, line breaks render explicitly, and a plain-text alternative includes every button URL. Marketing campaigns belong in Newsletter, which manages unsubscribes.

Design references: [HTML calls to action](https://templates.mailchimp.com/design/calls-to-action/), [table-based buttons](https://templates.mailchimp.com/development/html/buttons/), and [mobile-friendly touch targets](https://templates.mailchimp.com/design/mobile-friendliness/). Buttons use live text and a 46px minimum rendered height, so they remain readable when remote images are disabled.

Verification: `node scripts/verify-email.cjs`, `npx tsx scripts/verify-manual-email.ts`, TypeScript and production build. The scoped YAMUNAWOOD sending script defaults to preview; `--send` explicitly sends the branded update, with a fixed delivery event key. SMTP credentials come from the process/server environment and are never stored in source.
