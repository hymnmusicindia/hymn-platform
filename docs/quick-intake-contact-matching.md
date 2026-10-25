# Automatic contact matching in quick intake

Operators enter a name and a phone or email directly. Complete identity fields
trigger an exact check after a 220 ms pause. Names never trigger approximate
identity matches. Optional name search remains collapsed under its own summary.

The inline match panel offers Use existing contact, Edit existing contact and
Review merge. Selecting a registered HYMN customer links its existing matching
contact card, or creates a contact card linked to that account when none exists.
Missing phone/email fields can be filled from the account; existing populated
contact details are preserved. It never creates another login account, claims
an existing customer as an acquisition lead or sends a new introduction email.

Matching covers primary, secondary and additional emails, alternate phones,
linked-account email/contact email/mobile and unlinked customer/producer
accounts. Phone normalization treats Indian ten-digit and +91/0091 forms as
the same identity. Contact cards are workspace-scoped, private notes use the
existing visibility policy, and blocked/archived cards remain visible to prevent
duplicates. Inactive cards cannot continue into intake without status review.

When phone and email match different people, the operator must review the
matches. There is no silent merge. Merge requires explicit same-person
confirmation, a reason, matching record versions and the existing merge API.
Additional draft addresses are retained as aliases; saved primary values and
private notes remain protected. Existing safeguards block merging different
login accounts or conflicting pipeline histories. Such conflicts need manager
review rather than deleting history.

Late responses are discarded and prior searches are aborted when fields change.
The Save action performs another exact check, and the server repeats duplicate
validation in its workspace-locked transaction. A lookup failure never authorizes
an unchecked create. Merge replay keys and contact versions preserve retry and
concurrency protection.

Verification:

- `node --import tsx scripts/verify-acquisition-isolated.ts --intake-identity-only`
- `node scripts/verify-intake-contact-identity-browser.cjs`
- TypeScript and targeted ESLint.

No database migration is required.
