import { z } from 'zod';

export const spotifyProfileMismatchSchema=z.object({
  trackId:z.number().int().positive(),
  artistName:z.string().trim().min(1).max(255),
  spotifyArtistUrl:z.string().trim().regex(/^https:\/\/open\.spotify\.com\/artist\/[A-Za-z0-9]{22}\/?$/,'Use a Spotify artist profile link.'),
  spotifyTrackUrl:z.string().trim().regex(/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]{22}(?:\?[^\s]*)?$/,'Use the existing live Spotify track link.'),
}).strict();
export const spotifyMismatchHelp='https://support.spotify.com/us/artists/article/music-mixed-up-with-another-artist/';
