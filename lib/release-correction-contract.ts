import { z } from 'zod';

export const correctionKinds = {
  request_add_artist: 'Add artist', request_remove_artist: 'Remove artist',
  request_replace_artist: 'Replace artist', request_swap_artist_type: 'Change artist role',
  request_cover_art_change: 'Replace cover artwork', request_audio_change: 'Replace audio master',
  request_apple_not_live: 'Missing on Apple Music', request_meta_not_live: 'Missing on Meta',
} as const;
const track = { trackId: z.number().int().positive() };
const name = z.string().trim().min(1).max(255);
const spotify = z.string().trim().regex(/^https:\/\/open\.spotify\.com\/artist\/[A-Za-z0-9]{22}\/?$/).optional();
export const correctionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request_add_artist'), ...track, artist_name: name, artist_type: z.enum(['primary', 'featuring']), artist_spotify_url: spotify }).strict(),
  z.object({ action: z.literal('request_remove_artist'), ...track, artist_name: name }).strict(),
  z.object({ action: z.literal('request_replace_artist'), ...track, artist_name: name, new_artist_name: name, new_artist_spotify_url: spotify }).strict(),
  z.object({ action: z.literal('request_swap_artist_type'), ...track, artist_name: name, direction: z.enum(['primary_to_featuring', 'featuring_to_primary']) }).strict(),
  z.object({ action: z.literal('request_cover_art_change'), ...track, assetId: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('request_audio_change'), ...track, assetId: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('request_apple_not_live'), ...track }).strict(),
  z.object({ action: z.literal('request_meta_not_live'), ...track }).strict(),
]);
export type ReleaseCorrection = z.infer<typeof correctionSchema>;
