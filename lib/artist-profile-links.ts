import { verifiedArtistStoreLinks } from './artist-store-links';

export const artistProfileFields = [
  { key: 'spotifyUrl', label: 'Spotify', placeholder: 'https://open.spotify.com/artist/...', optional: false },
  { key: 'appleUrl', label: 'Apple Music', placeholder: 'https://music.apple.com/artist/...', optional: true },
  { key: 'youtubeUrl', label: 'YouTube', placeholder: 'https://www.youtube.com/@yourchannel', optional: true },
  { key: 'instagramUrl', label: 'Instagram', placeholder: 'https://www.instagram.com/yourprofile', optional: true }
] as const;
export type ArtistProfileLinkField = typeof artistProfileFields[number]['key'];

/** Optional links may be absent. Supplied links must identify an artist/channel. */
export function validateArtistProfileLinks(input: Partial<Record<ArtistProfileLinkField, string | null>>) {
  const values = Object.fromEntries(artistProfileFields.map(({ key }) => [key, input[key]?.trim() || null])) as Record<ArtistProfileLinkField, string | null>;
  const stores = verifiedArtistStoreLinks({ spotify: values.spotifyUrl, apple: values.appleUrl, youtube: values.youtubeUrl });
  const errors: Partial<Record<ArtistProfileLinkField, string>> = {};
  if (!stores.spotify) errors.spotifyUrl = 'Enter a Spotify artist profile link.';
  if (values.appleUrl && !stores.apple) errors.appleUrl = 'Use an Apple Music artist link, or remove this optional link.';
  if (values.youtubeUrl && !stores.youtube) errors.youtubeUrl = 'Use a YouTube channel link, or remove this optional link.';
  let instagramUrl: string | null = null;
  if (values.instagramUrl) {
    try {
      const url = new URL(values.instagramUrl);
      if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.username || url.password || url.port || !/^\/[A-Za-z0-9._]+\/?$/.test(url.pathname)) throw Error();
      instagramUrl = `https://www.instagram.com${url.pathname.replace(/\/$/, '')}`;
    } catch { errors.instagramUrl = 'Use an Instagram profile link, or remove this optional link.'; }
  }
  return { errors, links: { spotifyUrl: stores.spotify?.url ?? null, appleUrl: stores.apple?.url ?? null, youtubeUrl: stores.youtube?.url ?? null, instagramUrl } };
}
