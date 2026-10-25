export const leadStages = [
  { title: 'Contact saved', hint: 'We have their details. Check the source next.', stages: ['NEW', 'NEEDS_RESEARCH'], color: '#8b8cf8' },
  { title: 'Ready to call', hint: 'Source checked. A rep can speak with them.', stages: ['ASSIGNED', 'QUALIFIED', 'READY_TO_CONTACT'], color: '#60a5fa' },
  { title: 'Talked · check details', hint: 'We spoke. Confirm who they are and what they need.', stages: ['CONTACTED', 'REPLIED'], color: '#f5ba61' },
  { title: 'Verified lead', hint: 'A rep spoke with them and confirmed their details.', stages: ['VERIFIED_LEAD'], color: '#5ed6cb' },
  { title: 'Interested', hint: 'They want help or have received an offer.', stages: ['INTERESTED', 'OFFER_SHARED'], color: '#c4a3ff' },
  { title: 'Customer', hint: 'Their HYMN account is linked. Payment is tracked separately.', stages: ['CONVERTED'], color: '#77d99b' },
  { title: 'Closed', hint: 'No more sales follow-up. Respect requests to stop contact.', stages: ['LOST', 'NOT_INTERESTED', 'UNQUALIFIED', 'DUPLICATE', 'DO_NOT_CONTACT'], color: '#a1a1aa' },
];
export const stageLabel = (stage: string) => ({ NOT_INTERESTED: 'Not interested', UNQUALIFIED: 'Wrong contact details', DUPLICATE: 'Duplicate contact', DO_NOT_CONTACT: 'Do not contact', LOST: 'Closed' }[stage] || leadStages.find(lane => lane.stages.includes(stage))?.title || stage.replaceAll('_', ' '));
export const leadStageCodes = (stage: string) => ['NEEDS_RESEARCH', 'READY_TO_CONTACT', 'CONTACTED', 'INTERESTED'].includes(stage) ? leadStages.find(lane => lane.stages.includes(stage))!.stages : [stage];
