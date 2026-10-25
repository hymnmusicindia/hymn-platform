# Plain-language lead stages

Reference patterns: [HubSpot lifecycle stages](https://knowledge.hubspot.com/records/use-lifecycle-stages)
separate captured contacts from sales qualification. [Pipedrive leads vs deals](https://support.pipedrive.com/en/article/leads-vs-deals)
similarly distinguishes an unqualified contact from a qualified opportunity.
HYMN uses simpler operator language and its own explicit rep verification rules.

| Stage | What it means | Next action |
| --- | --- | --- |
| Contact saved | Details were saved. Nobody has confirmed this person yet. | Check source, phone/email and outreach eligibility. |
| Ready to call | Source is checked and the contact is eligible for outreach. | The assigned rep speaks with the person. |
| Talked · check details | An actual conversation was recorded. | Confirm identity, contact details and needs. |
| Verified lead | A rep recorded a conversation and explicitly confirmed the checks. | Help them and agree the next step. |
| Interested | They want assistance or received an offer. | Follow up at the agreed time. |
| Customer | An existing HYMN account is linked. | Serve the customer; payment evidence stays separate. |
| Closed | Not interested, invalid details, duplicate, lost or do not contact. | Respect the recorded reason; no further sales follow-up. |

The existing `TeamProspect.verified` field means **source checked**, not verified
lead. It still controls source/outreach readiness and researcher daily targets.
A new `VERIFIED_LEAD` stage and durable `LEAD_VERIFIED` outreach event represent
rep verification. This event is written only by the guarded call-save action,
requires a real conversation by that rep, explicit identity/needs confirmations,
and a second confirmation. A source check cannot create it. Advanced stages
cannot bypass it through another API path.

Verification evidence binds to normalized email and phone. A changed identity
invalidates the old verification in counts and pipeline projection; its historical
events remain intact. A new conversation must be recorded for the new details.
Duplicate confirmation does not inflate totals. Opt-outs and source eligibility
remain enforced.

Employee cards distinguish saved leads, verified leads, source checks today and
contacts reached. Researcher attribution remains with the original researcher;
call reps see verification performed by them. Existing records are never silently
promoted to verified. Legacy interested records without proof appear in Talked
until a rep confirms them. Existing linked customers retain their customer stage.

No schema migration is required: stage and outreach kind are existing string
columns. Nothing in this change edits production contact history.

Checks:

- `node --import tsx scripts/verify-acquisition-isolated.ts --lead-stages-only`
- `node scripts/verify-team-lead-stages-browser.cjs`
- TypeScript and targeted ESLint.
