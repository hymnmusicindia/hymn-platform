import {validateBeatReadiness, type BeatReadinessInput} from './beat-readiness';
import {exclusiveBeatEligible, sampleSourceConflict} from './beat-rights-policy';
export function beatQcReport(beat:BeatReadinessInput & {sampleDeclared?:boolean;contentConfirmed?:boolean; masterVerified?:boolean; storefrontReady?:boolean; restricted?:boolean; evidenceCount?:number}) {
  const issues=validateBeatReadiness(beat).issues.map(issue=>issue.message);
  if(!beat.contentConfirmed)issues.push('Confirm the uploaded recording matches this beat title.');
  if(!beat.sampleDeclared)issues.push('A confirmed producer rights declaration is required.');
  if(!beat.artworkUrl)issues.push('Add cover artwork before automatic publication.');
  if(!beat.masterVerified)issues.push('The private audio master must pass file integrity checks.');
  if(!beat.storefrontReady)issues.push('The producer storefront must be complete and active.');
  if(beat.restricted)issues.push('An existing correction or restriction requires reviewer approval.');
  if(beat.sampleDeclaration==='LICENSED_SAMPLES')issues.push(beat.evidenceCount?'Sample agreement supplied: review permissions and source-material restrictions.':'Upload the sample licence / certificate PDF.');
  if(beat.sampleDeclaration==='NO_UNCONTROLLED_SAMPLES'&&sampleSourceConflict(beat.sampleDisclosure))issues.push('The source disclosure conflicts with the original-material declaration.');
  return {decision:issues.length?'review' as const:'pass' as const,issues:[...new Set(issues)],exclusiveEligible:exclusiveBeatEligible(beat),checks:['Metadata and pricing','Private master integrity','Artwork present','Storefront readiness','Rights declaration and source conflicts'],limitation:'Automated checks do not identify every sample or prove ownership.'};
}
