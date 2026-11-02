# Team OS conversation tips

Work-station activities use the assigned representative's name and the current
contact's details rather than an imported employee-specific script. Guidance
follows services selected during the call, then the activity's service topic,
saved contact interests, and finally a recognised onboarding purpose.

Beats, distribution, mixing/mastering, promotion, playlist curation and engineer
onboarding have separate questions. A linked account contributes only its saved
customer type, purpose and preferred language. Private contact notes and unrelated
account fields are not used to infer preferences. Unknown interests prompt a
question instead of a guessed recommendation. Inactive contacts receive no sales
guide. Prices, availability and outcomes are not invented.

Legacy imported introduction paragraphs are removed when activities and queues
are read, including native mobile reads. Contact-specific context and authored
notes remain intact. This does not mutate task versions, timers, activity drafts
or stored history. New imports use a representative-neutral brief.

Verify with `node --import tsx scripts/verify-conversation-guide.ts` and
`node scripts/verify-work-station-browser.cjs`. Browser coverage checks a different
representative, saved language, live service changes, legacy cleanup, contact
editing and activity preservation in light/dark themes at 320–1440px widths.
