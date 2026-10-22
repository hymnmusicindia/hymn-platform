export const teamEmailTemplates = [
  { id: 'draft-help', name: 'Release draft assistance', subject: 'Need a hand finishing your release?', body: 'If you would like help finishing a release draft, tell me which step is holding you up. I can help with the next steps for audio, artwork, credits or delivery details.' },
  { id: 'service-enquiry', name: 'Service enquiry', subject: 'Let us help with your HYMN enquiry', body: 'I would be happy to answer your questions about our services. What are you working on, and what would you like help with? Share your goals, timeline and budget if useful.' },
  { id: 'call-follow-up', name: 'After our conversation', subject: 'Your next steps with HYMN', body: 'Thank you for speaking with us. Here are the next steps we discussed:\n\n[Add the actual agreed next steps here.]\n\nLet me know if you would like any clarification.' },
  { id: 'callback', name: 'Arrange another call', subject: 'A better time to talk?', body: 'Would you like to arrange a convenient time to discuss your music? Please reply with a preferred time and timezone. We will confirm availability before treating it as a booked appointment.' },
  { id: 'community-plan', name: 'Community partnership', subject: 'A HYMN plan for your community', body: 'We can discuss a tailored arrangement for your community, including beats, mixing/mastering, subscriptions or bulk projects. Tell me about your members, upcoming projects and the HYMN branding or social mentions you would be comfortable agreeing to.' },
] as const;
export function teamSenderRole(member: { jobTitle: string; role: { name: string; owner: boolean } }) { const title = member.jobTitle.trim(); return title && title.toLowerCase() !== 'team member' ? title : member.role.owner ? 'Founder' : member.role.name; }
export function personalTeamMessage(input: { recipientName: string; senderName: string; senderRole: string; body: string }) {
  return `Hi ${input.recipientName},\n\n${input.senderName} here, ${input.senderRole} at HYMN Music.\n\n${input.body.trim()}\n\nBest,\n${input.senderName}\n${input.senderRole} | HYMN Music`;
}
