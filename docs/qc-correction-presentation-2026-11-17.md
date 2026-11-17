# QC correction presentation audit - 17 November 2026

The current NOCTURNAL provider decision was repeated verbatim in all 19 track remarks. Extraction previously treated each carrying row as the affected track, flattened paragraph breaks, truncated at 1,000 characters (dropping required actions), and assigned the same rights field key to unrelated cards. Status email then concatenated the entire repeated review.

The parser now preserves paragraph breaks, splits explicit track headings, resolves all named track numbers against unique current local sequences, deduplicates shared notes, retains relevant required actions, and uses unique track-scoped issue keys. Unknown references and ambiguous ranges remain release-level review items. Fingerprints remain bound to submission attempts and ignore provider row order.

Correction emails contain bounded, grouped action summaries and a detailed QC review button below the summary. Supplementary audio matches are not embedded in email. New rendered email policy version 3 withholds older queued correction messages; attempt, correction fingerprint and report freshness guards remain enforced. Shared email section rendering preserves line breaks and escapes markup.

The detailed QC page presents the current authoritative correction items first. Supplementary evidence is collapsed and labelled separately. Reports sourced from previous-package UPCs remain in audit storage and are withheld from the current report. Automatic enrichment requests the current UPC.

Validation: 19-track repeated-note regression; exact tracks 1, 4, 19; complete required actions; unknown and ambiguous references; unique keys; stable fingerprints; scoped track evidence; bounded apology email; HTML escaping; existing sync regression; real isolated PostgreSQL QC/report/outbox lifecycle and access checks; desktop/mobile browser checks; TypeScript.

The operational repair is scoped to release 227 and attempt 73, preserves the provider decision and previous attempt history, does not change release assets or submit the release, and uses one deduplicated correction-clarification email with a durable SMTP outcome.
