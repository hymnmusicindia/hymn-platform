# Google SMTP for HYMN

## Setup

1. Choose the Gmail or Google Workspace mailbox that should send HYMN email. Customer Google login is separate; customers do not need app passwords.
2. Sign in to that account at https://myaccount.google.com/security and enable **2-Step Verification**.
3. Open https://myaccount.google.com/apppasswords. Create an app password named **HYMN Production**. Copy the generated 16-character password once; use it instead of the normal Google password.
4. Add these server environment variables in the hosting application's environment settings. For local verification, put them in your untracked `.env.hostinger`. Replace every placeholder:

```dotenv
EMAIL_ENABLED=true
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-sending-mailbox@gmail.com
SMTP_APP_PASSWORD=your16characterapppassword
EMAIL_FROM="HYMN Music <your-sending-mailbox@gmail.com>"
EMAIL_REPLY_TO=your-support-mailbox@example.com
NEXT_PUBLIC_APP_URL=https://your-real-hymn-domain.example
```

Keep `EMAIL_FROM` equal to the authenticated mailbox unless Google has authorized the sender alias. Use the actual public site URL so email buttons open the live site. Never put the password in a `NEXT_PUBLIC_` variable, Git, screenshots or browser code. The SMTP password can contain Google's display spaces; HYMN removes them.

5. Install dependencies with `npm ci` using Node 20.19+ (the project's requirement). Run `node --env-file=.env.hostinger scripts/verify-smtp.cjs` locally, or `node scripts/verify-smtp.cjs` on the server with its environment already configured. This checks authentication without sending email. Port 587 is also supported with STARTTLS; try it if hosting blocks 465. Keep TLS enabled.
6. Rebuild/redeploy and restart the application with the new server variables. Merely changing a local `.env.hostinger` does not update a hosted application.
7. Use your own test account to trigger a release status update and a test beat purchase. Check inbox/spam, action links and attachments. In Admin → Email Logs, inspect failures and use Retry after correcting configuration. A `sent` log means the provider accepted the message, not proof it reached the inbox.

Missing App Passwords can mean account/Workspace policy, Advanced Protection, or security-key-only 2-Step Verification. Ask the Workspace administrator if applicable. Google revokes app passwords after a Google account password change; generate a replacement and restart HYMN. Authentication error 535 usually points to the mailbox/password or account policy; connection timeouts usually point to hosting outbound SMTP restrictions.

Official references: [Google app passwords](https://support.google.com/mail/answer/185833), [Google SMTP settings](https://support.google.com/a/answer/176600), [Gmail sending limits](https://support.google.com/mail/answer/22839).

## Automatic mail coverage

| Area | Existing events using the shared email service |
| --- | --- |
| Releases | Submitted, under review, approved by HYMN, corrections requested, rejected (with available reason), sent to distributor, scheduled, live, distribution failure |
| Beats | Purchase confirmation, licence ready; payment webhook/reconciliation also sends confirmation using the same deduplication key |
| Studio | Request, acceptance, decline, delivery, revision, completion, refund update; recipient follows the workflow (customer or engineer) |
| Royalties | Earnings update, payout request, payout completion, payout rejection |
| Collaborators | Split invitation, acceptance and decline |
| Other existing flows | Referral rewards and opt-in newsletter campaigns use the configured transport; they retain their own templates |

Release, beat, payout, split and Studio messages use the shared responsive HTML layout, plain-text alternative, action button and fallback URL. Sending is triggered by the application's existing business events; it does not scan old records or replay historical status changes. No database migration is required for this change; the existing EmailLog table must already be deployed.

Events are logged and deduplicated. Mail failure does not undo a purchase or release update. Failed messages can be retried by an administrator. This is event-triggered sending, **not a durable background mail queue**: process interruptions need operational monitoring. Previously skipped/disabled messages are not automatically resent. Configure email before testing new events.

## Product files

Beat emails load attachments only from a matching paid/access-enabled purchase and send them only to that purchase owner's account email. Available licence documents are included first, then the stored beat deliverable if its format matches the purchased tier and the total raw attachment size stays within 10 MiB. WAV/FLAC and stems are not sent to lower-tier buyers. No format conversion is performed.

Large files, missing private files and files excluded by the tier checks remain accessible through the authenticated Purchases workflow according to its existing permissions. Messages still send when an attachment cannot be read. Private storage must be configured and the files present on the deployment. Retries recheck current access rather than storing file bytes in email logs. Studio assets remain in the authenticated Studio workspace.

## Inbox delivery and domain authentication

HTML design cannot guarantee inbox placement. Keep `EMAIL_FROM` on the same mailbox as `SMTP_USER`; HYMN enforces that for Google SMTP unless `SMTP_ALLOW_FROM_ALIAS=true` is deliberately enabled for an alias already authorized in Google. Do not enable the alias override for an unverified address.

If the From address uses a Google Workspace address at your own domain, authenticate that domain before sending:

1. Publish one SPF TXT record that covers every legitimate sender. For Google Workspace-only sending, Google documents `v=spf1 include:_spf.google.com ~all`. Merge Google into an existing SPF record rather than publishing a second SPF record.
2. In Google Admin Console, generate a 2048-bit DKIM key for the domain, publish the supplied selector TXT record at the DNS host, then start DKIM authentication in Google Admin.
3. After SPF and DKIM have been working for at least 48 hours, publish DMARC and monitor reports before increasing enforcement. Start with `p=none` and a reporting mailbox you control.
4. Send consistent transactional mail only to users who caused the event. Avoid sudden high volume, purchased lists and repeated tests to the same inbox. Ask internal testers to mark a legitimate message as **Not spam** and add the sender to contacts.
5. In Gmail, open **Show original** on a delivered test and verify SPF, DKIM and DMARC results. Use Google Postmaster Tools as volume grows.

As checked on 30 September 2026, `hymnmusic.fun` publicly advertised Hostinger mail senders in SPF and a DMARC `p=none` record, but no Google SPF inclusion or `google` DKIM selector was visible. That is correct only if the visible From address remains the authenticated `@gmail.com` account. Before sending as `@hymnmusic.fun` through Google Workspace, update SPF without removing the Hostinger includes and publish the exact DKIM value generated by Google Admin.

## Recommended next email flows (not enabled by this change)

Welcome/onboarding; payment failure with a safe retry link; beat refund confirmation; subscription renewal/failure/cancellation; account security changes; support ticket updates; takedown decisions; scheduled release reminders; periodic royalty statements. Each needs an authoritative event and deduplication key before enabling. Abandoned checkout, promotions and product recommendations should be opt-in marketing with unsubscribe controls.

Gmail has sending quotas and is not a bulk campaign service. Newsletter campaigns use the same SMTP mailbox; keep campaign volume within the mailbox provider's limits.
