# Release pipeline audit — work ledger

Scope: all 67 sections of the supplied September 23 audit brief. This is an in-progress evidence ledger, not a completion claim.

## Discovered flow

Release form / first-release funnel -> save-draft -> review-confirm -> payment/create-order -> payment/verify-submit -> updatePaidDistributionRelease -> HYMN QC queue -> admin approve-and-send -> distribution-service -> DireNote ingestion -> submission attempt + identifier snapshots -> authenticated cron status polling -> customer/admin portals. Corrections use an explicit re-ingestion workflow; takedowns use manually tracked partner requests. Razorpay has webhooks; the published DireNote v2.2 contract exposes ingestion, status and revenue, without a webhook or takedown API.

## Baseline evidence

- npm test passed on September 23 before audit changes. Many existing checks assert source patterns; this does not prove runtime behavior.
- Official contract inspected: https://distribution.direnotemedia.com/dnm_api (v2.2, updated August 21, 2026).
- Confirmed defects under investigation: unrestricted distribution transitions; HTTP 200 JSON without success acknowledgement accepted; retry can bypass accepted-release guard; uncertain ingestion results retried without provider idempotency guarantee; correction payload drops identifiers; artist mapper resolves by name.

## Requirement tracking

## Verified changes in this checkpoint

- `npm test`: passed, including contributor synchronization, provider failure responses, payment enforcement, media integrity, release transitions and input fuzz cases.
- `npm run test:direnote-virtual`: passed against an isolated PostgreSQL database, including ten-track draft rollback, stable track IDs, owner/status checks, concurrent-save exclusion, uncertain delivery deduplication, promotion races, payment event ordering, takedowns and provider lifecycle polling.
- `npm run lint`: zero errors; 79 warnings remain.
- `npx tsc --noEmit`: passed after regenerating Prisma Client.
- Upload resume now compares chunk content hashes; deploy migration `20260923070000_upload_content_identity` before running this version against an existing database.
- The initial production compilation succeeded, but its type-check stage used an outdated generated Prisma client and failed. The client has since been regenerated. A complete production build and browser run are not claimed by this checkpoint.

The section list below remains a backlog for the broader audit; passing these regression checks does not certify all 67 sections or real DSP delivery.

| Section | Evidence / status |
| --- | --- |
| 1. FIRST UNDERSTAND THE ENTIRE SYSTEM | Pending audit and executable coverage |
| 2. DO NOT FAKE SUCCESS | Pending audit and executable coverage |
| 3. BUILD A PROPER RELEASE STATE MACHINE | Pending audit and executable coverage |
| 4. RELEASE-LEVEL VALIDATION | Pending audit and executable coverage |
| 5. TRACK-LEVEL VALIDATION | Pending audit and executable coverage |
| 6. ARTIST IDENTITY / MAPPING | Pending audit and executable coverage |
| 7. ISRC VALIDATION | Pending audit and executable coverage |
| 8. UPC / EAN / RELEASE IDENTIFIERS | Pending audit and executable coverage |
| 9. AUDIO FILE VALIDATION | Pending audit and executable coverage |
| 10. ARTWORK VALIDATION | Pending audit and executable coverage |
| 11. METADATA QUALITY | Pending audit and executable coverage |
| 12. EXPLICIT / CLEAN CONTENT | Pending audit and executable coverage |
| 13. RELEASE DATE / TIMEZONE PROBLEMS | Pending audit and executable coverage |
| 14. RIGHTS AND OWNERSHIP | Pending audit and executable coverage |
| 15. YOUTUBE / CONTENT ID / UGC | Pending audit and executable coverage |
| 16. DISTRIBUTOR PAYLOAD | Pending audit and executable coverage |
| 17. DDEX COMPATIBILITY | Pending audit and executable coverage |
| 18. FILE UPLOAD PIPELINE | Pending audit and executable coverage |
| 19. DATABASE TRANSACTION SAFETY | Pending audit and executable coverage |
| 20. CONCURRENCY | Pending audit and executable coverage |
| 21. IDEMPOTENCY | Pending audit and executable coverage |
| 22. PAYMENT / RELEASE CREDIT / FREE RELEASE LOGIC | Pending audit and executable coverage |
| 23. API FAILURE MATRIX | Pending audit and executable coverage |
| 24. RETRIES | Pending audit and executable coverage |
| 25. WEBHOOKS | Pending audit and executable coverage |
| 26. POLLING | Pending audit and executable coverage |
| 27. PARTIAL DSP FAILURE | Pending audit and executable coverage |
| 28. CORRECTIONS | Pending audit and executable coverage |
| 29. AUDIO REPLACEMENTS | Pending audit and executable coverage |
| 30. TAKEDOWNS | Pending audit and executable coverage |
| 31. AUTHORIZATION / IDOR | Pending audit and executable coverage |
| 32. ADMIN SECURITY | Pending audit and executable coverage |
| 33. INPUT SECURITY | Pending audit and executable coverage |
| 34. FILE SECURITY | Pending audit and executable coverage |
| 35. SECRETS | Pending audit and executable coverage |
| 36. ERROR MESSAGES | Pending audit and executable coverage |
| 37. FORM UX | Pending audit and executable coverage |
| 38. MOBILE / RESPONSIVE SUBMISSION | Pending audit and executable coverage |
| 39. BROWSER FAILURES | Pending audit and executable coverage |
| 40. SESSION EXPIRATION | Pending audit and executable coverage |
| 41. DATA LOSS | Pending audit and executable coverage |
| 42. LOGGING / OBSERVABILITY | Pending audit and executable coverage |
| 43. AUDIT LOG | Pending audit and executable coverage |
| 44. STUCK RELEASE DETECTION | Pending audit and executable coverage |
| 45. DATABASE ↔ STORAGE RECONCILIATION | Pending audit and executable coverage |
| 46. DUPLICATE RELEASE DETECTION | Pending audit and executable coverage |
| 47. EXTERNAL PROVIDER CONTRACT | Pending audit and executable coverage |
| 48. STORE-SPECIFIC RULE ENGINE | Pending audit and executable coverage |
| 49. PRE-SUBMISSION VALIDATION ENGINE | Pending audit and executable coverage |
| 50. SUBMISSION TRANSACTION | Pending audit and executable coverage |
| 51. IMMUTABLE SUBMISSION SNAPSHOT | Pending audit and executable coverage |
| 52. TESTING | Pending audit and executable coverage |
| 53. CHAOS / FAILURE TESTING | Pending audit and executable coverage |
| 54. PROPERTY / FUZZ TEST IMPORTANT INPUTS | Pending audit and executable coverage |
| 55. ADMIN RECOVERY TOOLS | Pending audit and executable coverage |
| 56. USER STATUS UX | Pending audit and executable coverage |
| 57. DON'T DESTROY EXISTING FUNCTIONALITY | Pending audit and executable coverage |
| 58. DATABASE MIGRATIONS | Pending audit and executable coverage |
| 59. PERFORMANCE | Pending audit and executable coverage |
| 60. ACCESSIBILITY | Pending audit and executable coverage |
| 61. CURRENT INDUSTRY STANDARDS | Pending audit and executable coverage |
| 62. PRIORITY ORDER | Pending audit and executable coverage |
| 63. IMPLEMENT, DON'T JUST REPORT | Pending audit and executable coverage |
| 64. AFTER EVERY MAJOR FIX | Pending audit and executable coverage |
| 65. FINAL END-TO-END VERIFICATION | Pending audit and executable coverage |
| 66. REQUIRED OUTPUT AFTER IMPLEMENTATION | Pending audit and executable coverage |
| 67. MOST IMPORTANT RULE | Pending audit and executable coverage |
