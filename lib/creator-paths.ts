export const creatorPaths = {
  producer: { title: 'Producers', eyebrow: 'YOUR SOUND. YOUR STOREFRONT.', headline: 'Make room for your next beat.', copy: 'Build your store, set your licences and submit your original beats for review.', action: 'Set up my store', href: '/producer-onboarding', steps: ['Sign in', 'Create your store', 'Submit your first beat'], needs: ['A producer name and profile images', 'Your original audio and cover artwork', 'Licence prices and rights information'], note: 'You earn 70% of eligible sales. HYMN\u2019s share is 30%. Listings are reviewed before going live.', preview: 'Your beat store', detail: 'Original beats. Your identity.' },
  engineer: { title: 'Mixing & mastering engineers', eyebrow: 'YOUR CRAFT. YOUR NEXT PROJECT.', headline: 'Let your work do the talking.', copy: 'Create a studio profile that puts your sound, services and selected work in focus.', action: 'Build my engineer profile', href: '/studio/apply', steps: ['Sign in', 'Build your profile', 'Send for review'], needs: ['Profile photo and studio banner', 'A work sample and your role on the record', 'Services, starting price and delivery time'], note: 'HYMN reviews your profile and work before publishing. Applying does not guarantee approval or projects.', preview: 'Your studio profile', detail: 'Selected work. Clear services.' },
  curator: { title: 'Playlist curators', eyebrow: 'YOUR TASTE. A THOUGHTFUL LISTEN.', headline: 'Give new music a considered listen.', copy: 'Bring your playlist to HYMN and help artists understand where their music fits.', action: 'Add my playlist', href: '/dashboard/playlists?reviewView=curator', steps: ['Sign in', 'Add your playlist', 'Verify ownership'], needs: ['A Spotify playlist you control', 'Cover artwork and audience details', 'Your review fee and queue capacity'], note: 'HYMN checks playlist ownership before opening your listing. Reviews require personal listening; placement and streams are never guaranteed.', preview: 'Your curator listing', detail: 'Your audience. Your editorial choice.' }
} as const;
export type CreatorRole = keyof typeof creatorPaths;

export const creatorPerks = {
  producer: [
    { title: 'Purchase-linked licence PDFs', copy: 'HYMN prepares the agreement for the purchased licence and keeps its terms with the order.' },
    { title: 'Your prices. Your identity.', copy: 'Set licence prices and share a storefront built around your producer profile.' },
    { title: 'Private file delivery', copy: 'Purchased files are tied to buyer access. You remain responsible for the rights you offer.' }
  ],
  engineer: [
    { title: 'A portfolio ready to share', copy: 'Show your selected work, services, starting price and delivery time in one profile.' },
    { title: 'One project workspace', copy: 'Keep source files, client messages, revisions and deliveries together.' },
    { title: 'A clearer delivery process', copy: 'Track project progress and two included revisions, with paid revision requests when needed.' }
  ],
  curator: [
    { title: 'Your fee. Your capacity.', copy: 'Set your review fee and the number of active reviews you can take on.' },
    { title: 'A queue that keeps you organised', copy: 'Track submissions, listening notes and feedback deadlines in one place.' },
    { title: 'Your editorial independence', copy: 'Make your own fit decisions. A paid review never promises placement or streams.' }
  ]
} as const;
