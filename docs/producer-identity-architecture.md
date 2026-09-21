# Canonical producer and contributor identity architecture

Audit date: 2026-09-22

## Current HYMN map

| File/model or field | Purpose | Writer | Reader | Duplicate/current problem |
|---|---|---|---|---|
| `prisma/schema.prisma` — `User.role=PRODUCER` | Authentication/workspace capability | onboarding/admin approval | access control, producer dashboard | A login role was treated as producer identity. |
| `ProducerApplication.producerName` | Seller application snapshot | producer application API | admin review | Plain name, appropriate as application evidence but not identity. |
| `ProducerProfile.userId/displayName` | Public Beat Store presentation | producer/admin profile APIs | store pages, dashboard | Previously keyed only to User and disconnected from distribution credits. |
| `Release.producer` | Legacy release-level producer string | legacy/manual release code | legacy release views | Ambiguous release-wide plain text. |
| `Track.metadata.producers` | Provider-facing comma-separated names | release form/save APIs | DireNote mapper, UI reload | Plain strings cannot distinguish people or roles. |
| `Track.metadata.contributors[]` | Structured songwriter/composer/producer snapshots | release form | validation and DireNote | JSON had no durable identity and duplicated the same person across releases. |
| `ArtistCard.role` producer JSON | Artist persona optionally marked producer | artist API | release prefill | Artist persona and contributor identity were conflated. |
| `Beat.userId` | Seller/account that owns inventory | producer Beat API | Beat Store, checkout | Valid authorization owner, but not a stable music-industry Party. |
| `BeatSale.producerUserId` | Financial seller account | verified checkout | finance/dashboard | Correct payment account but missing canonical producer reference. |
| `BeatPurchase.licenseTermsSnapshot.producer.id` | Agreement evidence | checkout/license generation | legal PDF/download | Only User ID/name snapshot; could not follow stable Party identity. |
| `SplitRecipient.recipientUserId/email/name/role` | Royalty participation | split invite | split engine/dashboard | Payee enrollment existed separately but could not link to contributor identity. |
| `Royalty*`, `WalletTransaction`, `PayoutCredential` | Earnings, ledger, payout/KYC | imports/split engine/payment | finance/admin/user | Correctly account-centric; must remain separate from credit rows. |
| `lib/direnote.ts` | Provider payload mapping | distribution service | DireNote API | Mapping was embedded around legacy JSON and only three role strings. |
| `components/release-form*.tsx` | Track-credit entry | release owner | save/update endpoints | No reusable identity search; repeated names created no stable relationship. |
| `app/api/admin/producers*` | Producer administration | admin | admin UI | Managed producer Users/profiles, not unclaimed contributors or identity merges. |
| `lib/splits.ts` | Split invitations and acceptance | release owner/recipient | split engine | Credit and split were logically separate, but lacked a shared optional Party link. |
| `lib/beat-license.ts` | Immutable license output | checkout/admin | buyer | Snapshot behavior is correct; stable Party reference was missing. |

Repository-wide searches also identified producer consumers in Beat Store cards/experience, producer dashboard shells, producer finance/reporting, payout reports, admin control center, onboarding, notifications/email, change requests, release readiness, and DireNote verification scripts. They now consume or can resolve the same Party foreign keys rather than create another identity system.

## New architecture

- **User:** login, authorization, account status, seller access, payout and KYC. User ID is never presented as Producer ID.
- **ContributorParty:** durable person/organization identity with opaque public ID, professional/display name, private optional legal/contact fields, claim state, merge redirect, and external identifiers.
- **ProducerProfile:** optional public presentation attached to a claimed Party and User. It does not own historical credits.
- **ArtistCard:** DSP artist persona, optionally linked to the same Party. An artist persona remains distinct from production roles.
- **TrackContribution:** canonical track relationship `(track, party, role)` with credited-name snapshot and provider-role mapping. Multiple roles on one Party are valid; duplicate identical roles are constrained.
- **TrackContributionSnapshot:** immutable record of the exact Party, role, credited name, track, and submission attempt sent to a provider.
- **SplitRecipient:** financial participation with optional Party link and independent invitation/acceptance/payout state.
- **Beat / BeatSale / BeatPurchase:** inventory, transaction, and agreement retain their User/account references and additionally point to the same producer Party.
- **ReleaseTrackBeatLink:** optional structured proof that a licensed HYMN beat was used on a release track.
- **ContributorInvitation:** signed, hashed, expiring invitation linking an existing unclaimed Party to a verified-email User.
- **ProducerIdentityMerge:** append-only merge evidence; old Party becomes a redirect instead of being deleted.

## Identity rules

1. New contributors receive a random, immutable `HYM_…` public identifier. It is not derived from name or email.
2. Entering a new credit does not create a User, ArtistCard, public profile, split, rights ownership, or seller capability.
3. Reuse requires explicit Party selection, an existing client credit reference, a secure claim, or verified admin merge evidence. Names never trigger automatic merge.
4. The same Party can have many roles on a track and across releases.
5. Songwriter/composer legal credit names remain provider/QC inputs. Producer legal name remains optional; producer professional/credited name is required.
6. Claiming requires an unexpired hashed invitation token and the verified recipient email. One account cannot silently claim a second Party.
7. A professional-name change updates the profile and name history. It does not rewrite submitted contribution or agreement snapshots.
8. Removing a draft contribution deletes only the relation. Removing a delivered contribution uses the existing correction/re-ingest workflow.
9. Credit, split percentage, agreement basis, rights ownership, seller capability, and payout authorization remain independent records.

## Release lifecycle

The Credits dialog searches previous collaborators, professional names, and HYMN IDs without exposing email or legal names. Selecting a result stores its Party ID. Entering a new name creates an unclaimed Party during persistence using the client credit reference, so repeated autosaves reuse the same Party without name matching. “Apply to all tracks” creates distinct track relationships to the same Party.

Draft saves synchronize relational `TrackContribution` rows and retain JSON snapshots for migration compatibility. QC and DireNote payload creation read canonical credits. A successful provider-attempt claim snapshots every contribution before network delivery. Later edits on provider-owned releases remain in the controlled correction flow.

## Producer lifecycle

An unclaimed producer can be credited and delivered. A release owner may optionally send an invitation. The recipient signs in with the invited email, verifies the token, and claims the existing Party. The Producer dashboard catalog is derived from `TrackContribution`; Beat Store presentation is enabled only through separate producer/seller onboarding. Account deactivation can disable login/profile/selling while historical Party relations remain intact.

## Financial and agreement lifecycle

`TrackContribution` answers who did what. `SplitRecipient` answers who receives a defined percentage. Beat and distribution agreements answer the contractual basis. Royalty ledger and payout credentials stay attached to authenticated financial accounts. Party links improve continuity, while immutable sale/license snapshots preserve the parties, price, terms, date, and transaction as they existed at execution.

## Migration strategy

The schema migration backfills only high-confidence User-owned producer profiles, beats, BeatSales, BeatPurchases, and registered split recipients. It deliberately does not merge name-only track credits. `npm run audit:producer-identities` is a read-only dry run that classifies every source as:

- `SAFE_LINK`: explicit User ownership, Party ID, or other reliable relation.
- `POSSIBLE_DUPLICATE`: similarity signal that needs review.
- `AMBIGUOUS`: more than one plausible identity.
- `MANUAL_REVIEW`: plain name/email/snapshot without enough identity evidence.

Ambiguous rows remain operational through their legacy snapshot until explicitly resolved. Admin merge moves live relationships transactionally, rejects conflicting claimed accounts/public profiles, preserves submission snapshots, records evidence, and redirects the old Party to the canonical one.

## Privacy and authorization

Normal search returns public ID, professional/display name, country, claim state, and aggregate credit context. It never returns legal name, email, phone, payout, tax, or agreement data. Release owners can cite a Party but cannot edit its claimed profile or financial settings. Claim uses token plus verified email. Admin merge requires `users.manage` and recent authentication. Payout destinations remain outside contributor records.

## Query and scale design

Indexes cover public ID, claimed User, professional name, Party/role contributions, track contribution order, Party seller inventory, Party sale history, split participation, and invitation state. Search and admin catalog endpoints are bounded and paginated. Producer catalog reads indexed contribution rows with selective track/release fields rather than fetching complete release graphs.
