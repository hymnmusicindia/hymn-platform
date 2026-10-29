import assert from 'node:assert/strict';
import { automaticQcRevision, automationSensitiveSnapshot, distributionAutomationDecision, technicalReleaseFixes, canResolveRequestedFormatting } from '../lib/distribution-automation-policy';
import { signQcEvidence, validQcEvidence, assertCurrentAutomaticQc } from '../lib/distribution-qc-evidence';
import type { Release } from '../lib/types';

const release = { id: 123, userId: 1, recordVersion: 2, status: 'under_review', paymentStatus: 'paid', releaseTitle: 'Original', artistName: 'Artist', ownershipConfirmed: true, noUnauthorizedSamples: true, collaboratorsCredited: true, platformCompliant: true, hymnNotLiable: true, agreedToTerms: true, falseMetadataAcknowledged: true, metadata: {}, tracks: [{ id: 12, trackTitle: 'Original', primaryArtist: 'Artist', explicitContent: false }] } as Release;
const context = {accepted:false,uncertainAttempt:false,correctionResolved:false,openAmendment:false};
assert.equal(distributionAutomationDecision(release,context).eligible,true);
for(const field of ['ownershipConfirmed','noUnauthorizedSamples','collaboratorsCredited','platformCompliant','hymnNotLiable','agreedToTerms','falseMetadataAcknowledged'])assert.equal(distributionAutomationDecision({...release,[field]:false},context).eligible,false,field);
for(const status of ['draft','awaiting_payment','live','partially_live','delivery_failed','distributor_changes_required'] as Release['status'][])assert.equal(distributionAutomationDecision({...release,status},context).eligible,false,status);
assert.equal(distributionAutomationDecision({...release,paymentStatus:'pending'},context).eligible,false);
for(const contentType of ['non-exclusive','ai_generated'])assert.equal(distributionAutomationDecision({...release,contentType} as Release,context).eligible,false);
assert.equal(distributionAutomationDecision(release,{...context,uncertainAttempt:true}).route,'reconciliation');
assert.equal(distributionAutomationDecision(release,{...context,accepted:true}).route,'monitoring');
assert.equal(distributionAutomationDecision(release,{...context,accepted:true,correctionResolved:true}).route,'corrected_submission');
assert.equal(distributionAutomationDecision(release,{...context,openAmendment:true}).route,'amendment');
assert.equal(distributionAutomationDecision({...release,status:'queued_for_distribution'},context).eligible,false);
assert.equal(distributionAutomationDecision({...release,status:'queued_for_distribution'},{...context,retryable:true}).eligible,true);
for(const flag of ['copyrightClaim','copyrightClaimed','fraudFlag','manualQcHold','explicitContentMismatch'])assert.equal(distributionAutomationDecision({...release,metadata:{[flag]:true}},context).eligible,false);
const whitespace={...release,releaseTitle:'  Original  ',tracks:[{...release.tracks![0],trackTitle:' Original '}]};
assert.deepEqual(technicalReleaseFixes(whitespace).map(fix=>fix.after),['Original','Original']);
assert.equal(automationSensitiveSnapshot(release),automationSensitiveSnapshot({...release,releaseTitle:'Other title'}));
assert.notEqual(automationSensitiveSnapshot(release),automationSensitiveSnapshot({...release,artistName:'Different artist'}));
const requested={...whitespace,status:'changes_requested',reviewIssues:{type:'metadata',severity:'minor_issue',fields:[{field:'releaseTitle',label:'Title'}]}} as Release;
assert.equal(canResolveRequestedFormatting(requested),true);
assert.equal(canResolveRequestedFormatting({...requested,reviewIssues:{...requested.reviewIssues!,fields:[{field:'copyrightOwner',label:'Rights'}]}}),false);
const revision=automaticQcRevision(release);
const evidence={status:'passed',revision,checkedVersion:2,assetChecks:[{id:1,checksum:'abc'}],nested:{b:2,a:1}};
const signed={...evidence,proof:signQcEvidence(evidence)};
assert.equal(validQcEvidence({...signed,nested:{a:1,b:2}}),true,'JSONB key order must not break signatures.');
assert.equal(validQcEvidence({...signed,status:'manual_review_required'}),false);
assert.equal(validQcEvidence({status:'passed',revision}),false);
assertCurrentAutomaticQc({...release,metadata:{autoQc:signed}},revision);
for(const changed of [{...release,id:124},{...release,recordVersion:3},{...release,releaseTitle:'Changed'},{...release,tracks:[{...release.tracks![0],audioUrl:'/other.wav'}]}])assert.throws(()=>assertCurrentAutomaticQc({...changed,metadata:{autoQc:signed}},revision),/changed/);


const {correctionReviewSummary,releaseBucket,automationSummary}=require('../lib/distribution-workspace');
const corrected={...release,status:'under_review',contentType:'Non-Exclusive Licensed',metadata:{...release.metadata,correctionReview:{status:'pending'},autoQc:{status:'manual_review_required',changeKind:'missing_baseline'}}} as Release;
assert.equal(releaseBucket(corrected),'review');assert.equal(correctionReviewSummary(corrected)?.delivery,'Updated package not yet sent');assert.equal(automationSummary(corrected).label,'Rights review required');assert.equal(correctionReviewSummary({...corrected,status:'sent_to_distributor'}),null);

console.log('PASS automation policy: payment, all declarations, sensitive holds, amendments, accepted/uncertain attempts, safe retries, narrow formatting fixes, change detection and tamper-resistant revision evidence.');
