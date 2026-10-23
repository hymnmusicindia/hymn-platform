Contacts use a shared directory. Saving checks primary, secondary and additional emails and normalized primary/alternate phone numbers. Local ten-digit numbers use India's +91 prefix; explicit international numbers retain their country code. Matches are reviewed in the contact form before a deliberate merge. Staff confirm that the records represent the same person, choose the card to retain and record a reason.

A merge retains alternate contact details, task and calendar links, and an audit entry. Private notes remain on the original records, visible only under their existing access rules in the retained card's merged-record history. Work owners and acquisition attribution are unchanged. A do-not-contact state remains binding. Pending introductions are cancelled; merging does not request customer mail. Separate HYMN login accounts cannot be merged through this feature. Two existing pipeline records require a CRM manager to resolve their duplicate lead history first.

The additive `20261023230000_contact_merge_aliases` migration must precede application deployment. `npm run test:contact-merge` applies its actual SQL to a disposable baseline and tests duplicate checks, merges, aliases, private notes, identity boundaries, suppressions and scheduled calls.

Founder-provided call lists can be imported by an authorised operator using:

```
node --conditions=react-server --import tsx scripts/import-team-call-list.ts <private-json-file> <unique-batch-key>
node --conditions=react-server --import tsx scripts/import-team-call-list.ts <private-json-file> <same-batch-key> --apply
```

The input contains name, international phone, optional email, notes and optionally an existingUserId verified against actual account/release records. Keep these files and result reports outside source control. The script verifies the canonical production database and a unique active Kira call representative. The first command previews create/reuse counts; apply rechecks identity matches under the workspace lock. Re-running the same batch resumes without duplicating calls. It preserves existing notes and places the supplied brief in Kira's call tasks.

Each contact receives an internal follow-up task and calendar reservation, under one duty task assigned to Kira. Initial bookings use conflict-free weekday slots and at most ten introductions per day. The priority is friendly introductions, explaining current HYMN services and inviting customers to contact HYMN when needed, with specific notes for each person. Assignments stay pinned to Kira. Actual call outcomes use the existing callback workflow. Importing contacts does not send customer mail, place calls or create acquisition-credit claims.
