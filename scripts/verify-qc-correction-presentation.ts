import assert from 'node:assert/strict';
import { extractDireNoteCorrections, direNoteCorrectionFingerprint } from '../lib/direnote-corrections';
import { releaseStatusEmail } from '../lib/email/templates/release-status-email';
const tracks=Array.from({length:19},(_,i)=>({id:i+1,title:`Recording ${i+1}`,trackNumber:i+1,isrc:`USAAA26000${String(i+1).padStart(2,'0')}`}));
const decision=`Following our review, changes are required.

Track 1 and Track 19 \u2014 Copyright Restrictions

These tracks cannot be delivered due to copyright matches involving Sony and The Orchard. These tracks cannot be approved in their current form.

Track 4 \u2014 Unacceptable Ownership Documentation

The submitted documentation is insufficient. Please provide valid and verifiable documentation establishing rights to the composition and sound recording, including commercial distribution authorization.

Required Action

- Remove Tracks 1 and 19 from the album. These tracks cannot be delivered.
- For Track 4, submit acceptable ownership documentation or replace the track with a corrected version for further review.

The album will remain on hold.`;
const payload={release:{remarks:decision},tracks:tracks.map(t=>({...t,track_name:t.title,status:'Rejected',remarks:decision}))};
const issues=extractDireNoteCorrections(payload,tracks,227,73);
assert.equal(issues.length,3,'One shared album note must affect only its three explicitly named tracks.');
assert.deepEqual(issues.map(i=>Number(i.field.split('.')[1])).sort((a,b)=>a-b),[0,3,18]);
assert.equal(new Set(issues.map(i=>i.field)).size,3,'React fields must be unique.');
assert(issues.find(i=>i.field.startsWith('tracks.3.'))!.note.includes('replace the track'));
assert(!issues.find(i=>i.field.startsWith('tracks.0.'))!.note.includes('Unacceptable Ownership'));
assert.equal(direNoteCorrectionFingerprint(issues),direNoteCorrectionFingerprint(extractDireNoteCorrections({...payload,tracks:[...payload.tracks].reverse()},tracks,227,73)),'Provider row order cannot change the review.');
const unknown=extractDireNoteCorrections({remarks:'Track 999 - Please provide a licence.'},tracks,227,73);
assert(!unknown[0].field.startsWith('tracks.'),'Unknown references stay at release level.');
const range=extractDireNoteCorrections({remarks:'Tracks 1-19 require documentation.'},tracks,227,73);
assert(!range[0].field.startsWith('tracks.'),'Ambiguous ranges must not silently target only the first track.');
const duplicates=extractDireNoteCorrections({remarks:'Track 1 requires documentation.'},[tracks[0],{...tracks[1],trackNumber:1}],227,73);
assert(!duplicates[0].field.startsWith('tracks.'),'Duplicate sequence numbers need manual resolution.');
const independent=extractDireNoteCorrections({tracks:[{...payload.tracks[1],remarks:'Please replace the audio.'}]},tracks,227,73);
assert(independent[0].field.startsWith('tracks.1.'));
const mail=releaseStatusEmail('release_changes_requested',{userName:'NOCTURNAL',releaseTitle:'NOCTURNAL',releaseId:227,releaseStatus:'changes_requested',manageReleaseUrl:'https://hymn.test/dashboard/releases/227',qcReportUrl:'https://hymn.test/dashboard/releases/227/qc-report',correctionItems:issues,correctionApology:true,rejectionReason:decision.repeat(19)});
assert.match(mail.text,/Remove Tracks 1 and 19/);
assert.match(mail.text,/Track 4, submit acceptable ownership documentation or replace/);
assert.match(mail.text,/sorry/i);
assert(!mail.text.includes('Recording 2'));
assert(mail.text.length<2800,'Mail must remain a gist, not repeated report prose.');
assert(mail.html.includes('View detailed QC review'));
assert(mail.html.includes('https://hymn.test/dashboard/releases/227/qc-report'));
const escaped=releaseStatusEmail('release_changes_requested',{userName:'A',releaseTitle:'Album',releaseId:1,releaseStatus:'changes_requested',manageReleaseUrl:'https://hymn.test',correctionItems:[{label:'<script>bad</script>',note:'<img src=x onerror=bad>'}]});
assert(!escaped.html.includes('<script>bad'));
assert(escaped.html.includes('&lt;img'));
console.log('PASS repeated 19-track decision, exact track scope, unique fields, actions, stable fingerprint, unknown references, independent track notes, concise apology email, QC CTA and HTML escaping.');
