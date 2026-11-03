# Attachment reuse in release drafts

The reported duplicate failed because autosave wrote its display artwork route back into the canonical artwork column. Duplicates share owned private asset references; they do not need a second physical upload. Autosave now resolves display URLs inside the existing locked transaction before writing either the column or metadata. Duplication resolves the source reference too. Nested legacy routes are followed only across releases owned by the same customer, with a 12-release bound and cycle detection. Ownership reassignment does not grant the former owner access.

Track saves preserve an omitted cover-licence URL on the matched recording, including after reordering. Explicit replacements remain authoritative. Draft saves and submission use the persisted document reference rather than replacing it with a `previously_uploaded` marker. Existing legacy markers remain compatible only when already persisted server-side.

Uploaded cover licences, ownership PDFs and AI receipts are checked against the owner's ready, non-deleted StoredAsset records, purpose, MIME type and actual stored filename. Client-supplied filenames cannot change format checks. Explicit external ownership/AI proof links remain supported as links; validation does not fetch them. Production audio and artwork deliverables must use private asset paths in submission, correction and amendment flows. Existing upload validation still checks bytes, size and artwork/audio integrity.

Verification:

- `node scripts/verify-release-attachment-reuse.cjs`: owned artwork normalization, autosave URLs, nested duplicates, cycles, reassigned/foreign owners, deleted/incomplete uploads, document purpose/MIME/extension checks, external-proof behavior, WAV/MP3 acceptance, FLAC/ZIP/mismatched-extension rejection, and licence-preserving reorder/replacement.
- `node --import tsx scripts/verify-direnote-virtual.ts --release-save-only`: isolated PostgreSQL draft/duplicate regression, repeated duplication after autosave, licence preservation, stable track IDs, rollback, ownership/version/submission locks, payment races and 50-track credit batching.
- `node --conditions=react-server --import tsx scripts/verify-private-storage.ts`: upload filename, MIME, byte-content and size checks, artwork dimensions and authenticated range reads.
- Scoped TypeScript checks cover all changed routes and their imported implementation.

These checks exercise defined failure cases; they cannot guarantee availability of external document links or the underlying storage service. Missing or invalid files require re-upload rather than bypassing private-storage authorization.
