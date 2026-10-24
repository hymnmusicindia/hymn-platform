# Distribution music-step track management

The music upload step provides per-track Replace audio, Move up, Move down and Remove controls. Desktop users can also drag the handle to reorder. Arrow controls provide a keyboard and touch alternative. The displayed sequence is the sequence saved to the draft and used by later wizard steps.

Replacement uploads through the existing private resumable-upload service. The current master remains attached until the new WAV or MP3 finishes uploading. Failure or cancellation preserves the existing master. Success changes only the audio fields and duration; title, credits, ISRC and position remain on the same track. Progress and cancellation are available inline. Navigation, explicit saving and ordering are guarded during replacement. Original masters are not deleted by this operation.

Draft persistence matches stable client track identities before track numbers. Legacy drafts obtain an identity based on their original database track IDs. Reordering therefore retains the recording ID and its contributor links. New recordings cannot consume an ID reserved by another retained recording. Existing amendment order locks remain in force.

Validation:

- `node scripts/verify-music-master-browser.cjs` exercises the full wizard with API fixtures at desktop and phone widths, including order persistence, failure/cancellation recovery, successful replacement, credit/ISRC preservation, reload and amendment controls. It loads the application styles and produces screenshots under `.cache/music-master-browser/`. It does not test a live storage service or deployment.
- `npx tsx scripts/verify-acquisition-isolated.ts --music-master-only` exercises actual PostgreSQL saves in an isolated fixture, including track IDs, recording identifiers, contributor links, repeated saves, removal, legacy drafts and duplicate identity rejection.
