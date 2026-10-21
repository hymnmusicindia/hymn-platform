export const CUSTOMER_SERVICES = ['Mixing & mastering', 'Beat store', 'Artist services', 'Playlist curation'] as const;
export function serviceForPath(path: string): typeof CUSTOMER_SERVICES[number] | null {
  if (path === '/studio' || path === '/studio/start' || /^\/studio\/(?:engineers|genres)\/[a-zA-Z0-9_-]+$/.test(path)) return 'Mixing & mastering';
  if (path === '/beat-store' || path === '/beatstore') return 'Beat store';
  if (path === '/services' || path === '/managed-services') return 'Artist services';
  if (path === '/dashboard/playlists') return 'Playlist curation';
  return null;
}
