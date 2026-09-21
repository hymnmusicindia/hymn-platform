# Producer and contributor industry benchmark

Research date: 2026-09-22

This benchmark extracts structural principles for HYMN. It does not copy competitor pricing, commission, QC, rights, or seller rules. HYMN’s live DireNote contract remains the provider authority.

| Source | Practice | Relevance to HYMN | Decision | Reason |
|---|---|---|---|---|
| [DDEX: Communicating DisplayArtists and Contributors](https://kb.ddex.net/implementing-each-standard/best-practices-for-all-ddex-standards/guidance-on-contributors%2C-artists-and-writers/communicating-displayartists-and-contributors/) | A Party is referenced by DisplayArtist and Contributor composites. DisplayArtist describes the marketed artist; Contributor describes what a party did. One party can have several roles. | HYMN currently mixes artist cards and producer credits in places. | Adopt | Party identity, artist presentation, and contribution roles must be distinct. |
| [DDEX: ERN 3/4 differences](https://kb.ddex.net/implementing-each-standard/electronic-release-notification-message-suite-%28ern%29/ern-4-explained/differences-between-ern-3-and-ern-4/) | ERN 4 explicitly separates the marketed brand from parties who wrote or made the recording. Writers, arrangers, producers, and engineers are Contributors. | Gives HYMN a future-compatible resource-credit model. | Adopt, without claiming DDEX compliance | HYMN stores track contributions in this shape but does not implement ERN transport. |
| [DDEX RIN 2.1](https://rin.ddex.net/recording-information-notification) | RIN captures parties, studio events, recording components, equipment, and contributions during creation. | Supports a Party model that survives from recording through distribution. | Modify | HYMN needs identity and credit continuity now, not full studio-event interchange. |
| [DDEX RIN introduction](https://rin.ddex.net/recording-information-notification/1-introduction/) | DDEX distinguishes Initial Producer (company initiating production) from Studio Producer (person directing recording). | Prevents “producer” from becoming an ambiguous ownership role. | Adopt in vocabulary | HYMN’s production role must never imply master ownership or label status. |
| [DDEX: remixes and remixers](https://kb.ddex.net/implementing-each-standard/best-practices-for-all-ddex-standards/guidance-on-contributors%2C-artists-and-writers/communicating-remixes-and-remixers/) | Remixer contribution and DisplayArtist status are separate decisions. | A remixer may be a contributor, marketed artist, or both. | Adopt | Avoids automatically promoting a producer/remixer to primary artist. |
| [Spotify song credits](https://support.spotify.com/artists/article/song-credits/) | Spotify displays producer, engineer, songwriter, and artist credits supplied by the label/distributor. Corrections require resubmitted metadata. | HYMN must preserve exact submitted snapshots and use correction flow after delivery. | Adopt | Profile changes must not silently rewrite delivered credits. |
| [Spotify metadata guidelines](https://support.spotify.com/artists/article/metadata-formatting-guidelines/) | Roles affect credit and artist-page behavior; roles exist at track and release levels and include performers and non-performers. | HYMN needs explicit track roles and separate artist-page mappings. | Adopt with provider-specific mapping | Internal roles remain richer than DireNote’s present contract. |
| [Apple Music Specification 5.3.26](https://help.apple.com/itc/musicspec/en.lproj/static.html) | Each contributor can carry multiple roles; Apple accepts name, Apple ID, and optional ISNI, and recommends specific production, engineering, performer, composition, and lyrics roles. | Confirms stable IDs, multi-role parties, and track-level credits. | Adopt | A single person can be producer, songwriter, and performer without duplicate identities. |
| [Apple Music Style Guide](https://help.apple.com/itc/musicstyleguide/en.lproj/static.html) | Producer/engineer personnel are non-primary unless they also have a performing role; composition and lyrics use specific roles. | Prevents producer-to-artist conflation. | Adopt | Artist placement and production credit have different effects. |
| [Apple Music for Artists: metadata](https://artists.apple.com/support/1119-music-metadata) | Accurate contributor/personnel metadata aids recognition and compensation; corrections flow through label/distributor. | HYMN QC should validate credits and corrections centrally. | Adopt | Server-side readiness and provider correction remain authoritative. |
| [DistroKid: adding a producer](https://support.distrokid.com/hc/en-us/articles/1500011410142-Adding-a-Producer-to-a-Release) | Producer name is required; email is optional/private; producer credits can be sent as later metadata updates. | Producer account registration and legal name should not be required to credit someone. | Adopt | HYMN requires a professional credit name and makes invitation optional. |
| [DistroKid: artist roles](https://support.distrokid.com/hc/en-us/articles/1500006478301-Understanding-Artist-Roles) | Producer is a track-detail credit distinct from album, primary, featured, and remixer roles. | Reinforces contributor/artist separation. | Adopt | Prevents incorrect store attribution. |
| [CD Baby: artist and contributor roles](https://support.cdbaby.com/hc/en-us/articles/360015962932-How-do-I-credit-artists-correctly-on-my-release) | Songwriters use legal/registered names for PRO matching; producers and engineers use distinct contributor roles. | HYMN should require legal names for writers where its provider contract needs them, not for producers. | Adopt | Fixes the former blanket legal-name rule. |
| [UnitedMasters: artist roles](https://support.unitedmasters.com/hc/en-us/articles/40677820717203-Understanding-Artist-Roles-when-releasing-a-song-or-album) | Producers/writers belong in song metadata and should not be primary artists unless they also perform. | Confirms role-specific display behavior. | Adopt | One person can have separate performing and production relationships. |
| [LANDR: collaborator credits](https://support.landr.com/hc/en-us/articles/31619635245591-How-do-I-credit-my-collaborators-on-my-LANDR-release) | Producers are entered in a dedicated field, not title or artwork. | HYMN’s credits UI should use structured entries. | Adopt | Structured metadata is provider-safe and searchable. |
| [LANDR: royalty splits](https://support.landr.com/hc/en-us/articles/5096663293591-Can-I-remove-a-collaborator-from-a-split) | Track royalty splits are separate agreements; collaborators need an account to activate payment. | Credit can exist without an account, while payout activation can require one. | Adopt, preserve HYMN split policy | Contributor identity and financial onboarding remain separate. |
| [Symphonic: contributor roles](https://support.symdistro.com/hc/en-us/articles/360027132871-Contributor-Roles-Requirements) | Writer, performer, and production/engineering groups are track-level; multiple roles can be added. | Informs HYMN’s internal role vocabulary. | Adopt | Role vocabulary should be broader than the current three DireNote fields. |
| [Symphonic SplitShare](https://support.symdistro.com/hc/en-us/articles/31295699238925-SplitShare-Overview) | Payee enrollment, track assignment, split percentage, and earnings transfer are separate states. | HYMN should link a Party to SplitRecipient without turning a credit into a split. | Adopt | “Who did what?” remains separate from “who gets what?”. |

## Findings

### DDEX model

- **Party:** the durable identity referenced throughout a message; identifiers can include sender-proprietary IDs and external standards.
- **Contributor:** a relationship between a Party and a recording/resource, with one or more roles and display-credit information.
- **DisplayArtist:** the party/brand under whose name a release or resource is marketed. It is not a synonym for contributor.
- **Roles:** StudioProducer, Composer, Lyricist/ComposerLyricist, engineers, performers, arrangers, and other controlled values describe work performed. Initial Producer has a different business meaning.
- **Identifiers:** proprietary Party IDs are valid internally; ISNI and domain-specific identifiers improve matching but are not prerequisites for a credit.

### Spotify and Apple

Both rely on label/distributor metadata. Spotify exposes received credits and requires distributor resubmission for corrections. Apple’s delivery format groups several roles under one contributor identity, distinguishes primary status, and supports Apple IDs and ISNI to reduce ambiguity. Neither platform justifies making a HYMN login account a prerequisite for a producer credit.

### Distributor patterns

The consistent pattern is track-level structured credits, dedicated roles, legal/registered writer names, professional producer names, and optional producer contact data. Some systems let credits change after release, but the change travels through a metadata correction rather than silently mutating a store record.

### Beat marketplace and split patterns

Seller capability, licenses, payee enrollment, and royalty splits are operational relationships around a person. They are not the person’s identity. Account or KYC requirements belong at seller/payout activation, while an unclaimed producer can still receive a credit.

## Recommended HYMN model

HYMN uses a stable `ContributorParty` with an opaque `HYM_…` public ID. A User may securely claim one Party, but the Party can predate an account. `TrackContribution` records who did what on a track and preserves the credited name. `ArtistCard` remains a DSP-facing artist persona. `ProducerProfile` remains optional presentation data. Beat seller capability continues through an authenticated User and producer onboarding, linked to the same Party. `SplitRecipient`, payout/KYC, and agreement records reference the Party where reliable while preserving their own acceptance, authorization, and immutable snapshots.

This architecture follows DDEX’s structural concepts but does not claim DDEX compliance. DireNote receives only fields supported by HYMN’s actual contract through one mapper.
