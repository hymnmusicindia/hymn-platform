export const BEAT_GENRES = ['Hip-Hop', 'Trap', 'Drill', 'Boom Bap', 'R&B', 'Soul', 'Pop', 'Afrobeats', 'Afrobeat', 'Amapiano', 'Dancehall', 'Reggaeton', 'Latin', 'Lo-Fi', 'Jazz', 'Funk', 'Disco', 'House', 'Techno', 'Trance', 'EDM', 'Dubstep', 'Drum & Bass', 'UK Garage', 'Grime', 'Ambient', 'Cinematic', 'Rock', 'Indie', 'Acoustic', 'Country', 'Gospel', 'Bollywood', 'Desi Hip-Hop', 'Punjabi', 'Indian Classical', 'World', 'Experimental'];
export const BEAT_MOODS = ['Dark', 'Energetic', 'Chill', 'Sad', 'Aggressive', 'Uplifting', 'Happy', 'Melancholic', 'Romantic', 'Dreamy', 'Atmospheric', 'Emotional', 'Epic', 'Mysterious', 'Groovy', 'Soulful', 'Confident', 'Relaxed', 'Nostalgic', 'Playful', 'Tense', 'Peaceful', 'Motivational', 'Introspective'];
export const BEAT_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].flatMap(note => [`${note} Major`, `${note} Minor`]);
export function splitBeatMoods(value: string) { return [...new Set(value.split(',').map(mood => mood.trim()).filter(Boolean))]; }
export function normalizeBeatMoods(value: string) { return splitBeatMoods(value).map(mood => BEAT_MOODS.find(option => option.toLowerCase() === mood.toLowerCase()) ?? mood).join(', '); }
export function normalizeBeatKey(value: string) {
  const match = value.trim().replace(/♯/g, '#').replace(/♭/g, 'b').match(/^([a-g])([#b]?)\s*(major|minor|maj|min|m)?$/i);
  if (!match) return value.trim();
  const flats: Record<string, string> = { Cb:'B', Db:'C#', Eb:'D#', Fb:'E', Gb:'F#', Ab:'G#', Bb:'A#', 'B#':'C', 'E#':'F' };
  const note = match[1].toUpperCase() + match[2];
  const mode = match[3] ?? 'major';
  return `${flats[note] ?? note} ${mode === 'M' || /^(major|maj)$/i.test(mode) ? 'Major' : 'Minor'}`;
}
