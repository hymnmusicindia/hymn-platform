# QC report integrity audit — 11 November 2026

YAMUNAWOOD (release 81, current submission attempt 52) received a cover-art metadata correction in the release-information response logged at 18:49 IST. The stored correction reason and sent correction email (email log 21760, 18:53 IST) additionally included seven WARDAAT fingerprint matches as an audio-match correction.

The QC endpoint was fetched again for this review (log 136848); this is not proof the entire report was an old email. The defect was that scan evidence was promoted to an actionable correction, and the reader independently preferred historical snapshots containing matches over newer snapshots. Older evidence remains available internally in the audit log.

Current release-information remarks now take precedence over report enrichment. Fingerprint matches remain supplementary evidence and never create correction fields by themselves. Reports carry the review fingerprint and are selected from the latest snapshot for the current submission and UPC. A failed fetch cannot fall back to historical evidence. Missing or mismatched reports during automated sync create a deduplicated high-priority QC integrity task for staff. This runs in the existing recurring distribution sync, not a separate scheduler.

Correction emails carry the report snapshot timestamp. The outbox checks it again before SMTP and holds changed/unavailable reports for review. Previously rendered correction emails without the new integrity policy version are also held. Existing correction-event and submission supersession checks remain in effect. Email review entries and QC integrity tasks require staff follow-up; sent messages cannot be recalled.

Verification: `node --import tsx scripts/verify-direnote-virtual.ts --qc-report-only` uses disposable PostgreSQL and mocked partner responses/SMTP. It covers replacement of earlier rights remarks with the artwork remark, supplementary match evidence, latest-only selection, review mismatch, changed-report and legacy-email delivery holds, repeat-sync deduplication, UPC/ISRC rejection and private report access.

No production records were modified and no customer email was sent during this audit. Deploy the code and run the normal current-attempt sync to update existing correction records. A Git push alone does not confirm deployment or remediation of existing records.

Follow-up reconciliation: the partner subsequently returned Pending for all five YAMUNAWOOD tracks while retaining the identical artwork remarks. Reconciliation now ignores that exact previously applied review only when the full current UPC/ISRC listing is verified and every track is Pending, without an explicit blocking status. New remarks still enter corrections. Regression coverage verifies the transition, repeated-sync stability and continued handling of new Pending-track remarks.
