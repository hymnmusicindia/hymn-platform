import { artistCreditNames } from './release-artist-validation';

// Album identity is independent of track order and track-specific collaborators.
export function resolveReleaseArtistIds(name: string, profiles: { id: number; name: string }[]) {
  return artistCreditNames(name).flatMap(name => {
    const matches = profiles.filter(profile => profile.name.trim().toLowerCase() === name.trim().toLowerCase());
    return matches.length === 1 ? [matches[0].id] : [];
  });
}

export function replaceReleaseArtists(trackIds: number[], previous: number[], next: number[]) {
  const removed = new Set(previous.filter(id => !next.includes(id)));
  return [...new Set([...next, ...trackIds.filter(id => !removed.has(id))])];
}
