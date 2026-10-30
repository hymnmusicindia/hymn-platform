export function usesHymnStudioShell(pathname: string) {
  return ['/studio','/dashboard','/dashboard/customer','/producer/dashboard','/producer-dashboard','/library','/audio-library','/analytics','/payout'].includes(pathname)
    || ['/studio/','/dashboard/purchases'].some(path => pathname.startsWith(path));
}

export const studioDestinations = [
  { key: 'overview', label: 'Overview', group: 'Workspace', href: '/studio', icon: 'home' },
  { key: 'library', label: 'My library', group: 'Workspace', href: '/library', icon: 'folder' },
  { key: 'releases', label: 'Releases', group: 'Create & manage', href: '/studio?tab=releases', icon: 'disc' },
  { key: 'projects', label: 'Mixing & mastering', group: 'Create & manage', href: '/studio?view=projects', icon: 'headphones' },
  { key: 'engineers', label: 'Find an engineer', group: 'Create & manage', href: '/studio?view=engineers', icon: 'sliders' },
  { key: 'engineer-workspace', label: 'Engineer workspace', group: 'Create & manage', href: '/studio/engineer', icon: 'headphones' },
  { key: 'analytics', label: 'Analytics', group: 'Grow', href: '/studio?tab=analytics', icon: 'chart' },
  { key: 'promotions', label: 'Promotion', group: 'Grow', href: '/studio?tab=promotions', icon: 'megaphone' },
  { key: 'content-id', label: 'Content ID', group: 'Grow', href: '/studio?tab=content-id', icon: 'shield' },
  { key: 'collaborators', label: 'Royalty splits', group: 'Business', href: '/studio?tab=collaborators', icon: 'users' },
  { key: 'earnings', label: 'Earnings & payouts', group: 'Business', href: '/payout', icon: 'wallet' },
  { key: 'subscription', label: 'Plan & billing', group: 'Business', href: '/studio?tab=subscription', icon: 'credit' },
  { key: 'referral', label: 'Referrals', group: 'Business', href: '/studio?tab=referral', icon: 'gift' },
  { key: 'messages', label: 'Notifications', group: 'Your account', href: '/studio?tab=messages', icon: 'bell' },
  { key: 'settings', label: 'Profile & settings', group: 'Your account', href: '/studio?tab=settings', icon: 'settings' },
  { key: 'account', label: 'Account & activity', group: 'Your account', href: '/studio?tab=account', icon: 'shield' },
  { key: 'support', label: 'Help & support', group: 'Your account', href: '/studio?tab=support', icon: 'help' },
] as const;

export const studioTools = [
  { title: 'New release', detail: 'Audio, artwork and distribution', href: '/distribution/start', icon: 'disc' },
  { title: 'Mix-readiness check', detail: 'Check your recording before mixing', href: '/studio/readiness', icon: 'sliders' },
  { title: 'Find an engineer', detail: 'Professional mixing and mastering', href: '/studio?view=engineers', icon: 'headphones' },
  { title: 'Explore beats', detail: 'Find the sound for your next track', href: '/beat-store', icon: 'music' },
  { title: 'Artist services', detail: 'Support for your next chapter', href: '/managed-services', icon: 'sparkles' },
  { title: 'Become an engineer', detail: 'Apply to offer your services', href: '/studio/apply', icon: 'users' },
] as const;
