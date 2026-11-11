# DireNote v3.1 feature coverage ? 11 November 2026

Source: [official live API documentation](https://distribution.direnotemedia.com/dnm_api), JavaScript-rendered reference read on 11 November 2026. The earlier v2.4 audit is historical; it is not the complete current API inventory. This audit compares documented capabilities with executable HYMN integration code, not production account permissions.

Current implementation: [Distribution services workflow and activation](distribution-services.md). The table below records the audit findings before implementation; the listed gaps are now implemented in code, with live activation requirements documented separately.

## Original audit findings, in priority order

| Priority | Capability | Current HYMN gap | Customer benefit |
| --- | --- | --- | --- |
| 1 | Instagram/Facebook availability appeal (`request_meta_not_live`) | Previously buried in general correction selection. Dedicated appeal and release-page entry added in this change. | Artist can select a recording, provide Spotify evidence and rejection details, and track the request. |
| 2 | Instagram profile linking (`request_instagram_linking`) | No request workflow. Updating an artist Instagram URL is a separate operation and does not perform linking. | Ask to associate a live recording with Instagram/Facebook artist profiles. |
| 2 | YouTube Official Artist Channel (`request_yt_oac`) | No OAC request integration. | Artist channel upgrade with progress tracking. |
| 2 | Claim release (`request_yt_claim`, `request_facebook_claim`, `request_tiktok_claim`, `request_soundcloud_claim`) | No claim-release workflows. These should require claim evidence and rights review. | Resolve an unwanted claim without taking down the recording. |
| 2 | Dedicated royalty analytics (25 `revenue_*` endpoints below) | HYMN has imported revenue reporting, but does not call these dedicated analytics endpoints. | Platform/country breakdowns, trends, period comparison and per-track summaries. These are reporting tools, not wallet credits. |
| 2 | Signed webhooks | No DNM-Signature receiver found. Existing integration uses polling. | Faster release, request, payout and copyright-event updates. Requires signature verification, replay protection and reconciliation; not merely a callback URL. |
| 3 | Store takedown (`request_takedown`) | HYMN has local tracked takedown requests, but no direct provider endpoint call. `withdraw_release` is different. | Submit eligible live-release takedowns after explicit review. Provider documents a 90-day live-release restriction. |
| 3 | Smart links (`get_smartlink`) | Available in admin catalogue tooling; customer promotion is separate. Not missing transport. | Adopt verified provider store links into artist promotion after ownership binding. |
| 3 | Reference endpoints | Available in admin catalogue tools; customer wizard values are largely fixed. | Keep accepted genres/languages/store/territory choices current using cached references. |
| 4 | Music video distribution (`ingest_video`, `video_status`) | Not integrated. | New video delivery product, requiring upload, pricing, eligibility and job tracking. |
| 4 | Master collection (`register_master_work`, `master_work_status`) | Not integrated. | Rights collection registration, requiring rights consent and society-specific review. |

## Existing features that should not be rebuilt

Audio ingestion and job/status reconciliation, verified QC reports, artist/songwriter catalogue reads and updates, partner payout reads and reference lookups already have integrations. Existing recording corrections support artist/credit changes, cover/audio replacements, Apple availability requests, Meta availability requests and request-status reads. An endpoint reference proves code coverage, not that every user can see it or that an account is entitled to use it.

## Meta appeal delivered in this change

Live/partially-live release pages expose ?Appeal Meta availability?; Requests starts with a dedicated Instagram/Facebook appeal. The form requires the affected ISRC-bearing track, a Spotify track URL, confirmation that the recording is playable, and a reason/rejection description. The evidence is saved internally; the provider payload remains the documented ISRC plus server credentials. Artist attestation is not independent Spotify verification, and the provider remains responsible for eligibility checks.

The existing ownership checks, locked recording identifiers, serialized active-request deduplication, durable pre-send audit, uncertain-outcome hold, partner receipt tracking and notification/email outbox are reused. A prior active metadata request is shown and blocks another submission. Technical requests use the existing automation queue; approvals remain distinct from confirmed store availability. Existing legacy requests retain compatibility. No new ingestion is triggered and NO CONTENT ID is not bypassed. The documented seven working days is a review expectation, not a delivery guarantee.

No production appeals or artist emails are submitted by implementation tests. No schema migration is required. Production deployment is separate from a Git push.

## Complete documented endpoint inventory

?Code reference? means a matching runtime integration/allowlist exists under `lib/`; it is not a claim of complete customer UI coverage. Missing endpoints are opportunities, not tasks automatically authorized for implementation.

| Endpoint | Source coverage |
| --- | --- |
| `/ingest_content` | Code reference; see capability notes above |
| `/ingest_status` | Code reference; see capability notes above |
| `/check_release_status` | Code reference; see capability notes above |
| `/list_releases` | Code reference; see capability notes above |
| `/get_smartlink` | Code reference; see capability notes above |
| `/check_qc_report` | Code reference; see capability notes above |
| `/withdraw_release` | Code reference; see capability notes above |
| `/request_takedown` | Not integrated |
| `/ingest_video` | Not integrated |
| `/video_status` | Not integrated |
| `/register_master_work` | Not integrated |
| `/master_work_status` | Not integrated |
| `/check_artist` | Code reference; see capability notes above |
| `/list_artists` | Code reference; see capability notes above |
| `/update_artist` | Code reference; see capability notes above |
| `/check_songwriter` | Code reference; see capability notes above |
| `/list_songwriters` | Code reference; see capability notes above |
| `/update_songwriter` | Code reference; see capability notes above |
| `/request_add_artist` | Code reference; see capability notes above |
| `/request_remove_artist` | Code reference; see capability notes above |
| `/request_replace_artist` | Code reference; see capability notes above |
| `/request_swap_artist_type` | Code reference; see capability notes above |
| `/request_cover_art_change` | Code reference; see capability notes above |
| `/request_audio_change` | Code reference; see capability notes above |
| `/request_yt_claim` | Not integrated |
| `/request_facebook_claim` | Not integrated |
| `/request_tiktok_claim` | Not integrated |
| `/request_soundcloud_claim` | Not integrated |
| `/request_apple_not_live` | Code reference; see capability notes above |
| `/request_meta_not_live` | Code reference; see capability notes above |
| `/request_instagram_linking` | Not integrated |
| `/request_yt_oac` | Not integrated |
| `/list_support_requests` | Code reference; see capability notes above |
| `/check_revenue_report` | Code reference; see capability notes above |
| `/list_payouts` | Code reference; see capability notes above |
| `/revenue_top_artists` | Not integrated |
| `/revenue_top_releases` | Not integrated |
| `/revenue_top_tracks` | Not integrated |
| `/revenue_top_platforms` | Not integrated |
| `/revenue_top_countries` | Not integrated |
| `/revenue_top_labels` | Not integrated |
| `/revenue_per_stream_by_platform` | Not integrated |
| `/revenue_per_stream_by_country` | Not integrated |
| `/revenue_per_stream_by_artist` | Not integrated |
| `/revenue_by_platform_country` | Not integrated |
| `/revenue_by_sales_type` | Not integrated |
| `/revenue_by_release_type` | Not integrated |
| `/revenue_monthly_trend` | Not integrated |
| `/revenue_quarterly_trend` | Not integrated |
| `/revenue_yearly_trend` | Not integrated |
| `/revenue_platform_trend` | Not integrated |
| `/revenue_country_trend` | Not integrated |
| `/revenue_artist_trend` | Not integrated |
| `/revenue_period_comparison` | Not integrated |
| `/revenue_artist_summary` | Not integrated |
| `/revenue_release_summary` | Not integrated |
| `/revenue_track_summary` | Not integrated |
| `/revenue_analytics_summary` | Not integrated |
| `/revenue_analytics_breakdown` | Not integrated |
| `/revenue_analytics_trend` | Not integrated |
| `/list_territories` | Code reference; see capability notes above |
| `/list_stores` | Code reference; see capability notes above |
| `/list_genres` | Code reference; see capability notes above |
| `/list_languages` | Code reference; see capability notes above |
| `/list_instruments` | Code reference; see capability notes above |
| `/list_contributor_roles` | Code reference; see capability notes above |
| `/list_video_platforms` | Code reference; see capability notes above |
| `/list_master_collecting_bodies` | Code reference; see capability notes above |
| `/list_mechanical_societies` | Code reference; see capability notes above |
| `/list_performance_societies` | Code reference; see capability notes above |

## Verification

- `node --import tsx scripts/verify-acquisition-isolated.ts --release-corrections-only`: disposable PostgreSQL; existing correction regression coverage plus Meta evidence validation, ownership, duplicate requests, exact partner payload and repeated-send protection.
- `node scripts/verify-meta-appeal-browser.cjs`: component rendering with generated Tailwind CSS at 320, 390 and 1440 pixels; submission fields, server-error recovery preserving entered text, saved-request feedback and active-request disabling.
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --incremental false`: full TypeScript check.

To find the feature: open a live or partially-live release, choose **Appeal Meta availability** near the release section tabs, or open **Requests**. The appeal form appears before general corrections and request history continues below the existing request tools.
