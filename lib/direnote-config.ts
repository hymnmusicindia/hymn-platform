export const DIRENOTE_INGEST_ENDPOINT = "https://dashboard.direnotemedia.com/ingest_api";

export const DIRENOTE_CONTENT_TYPES = ["Original/Exclusive Licensed", "AI Generated", "Non-Exclusive Licensed"] as const;
export type DireNoteContentType = typeof DIRENOTE_CONTENT_TYPES[number];

export const DIRENOTE_GENRE_CATALOG = {
  Pop: ["Mainstream Pop", "Indie Pop", "Synth Pop", "Electropop", "Dance Pop", "Teen Pop", "Pop Rock", "Dream Pop", "Art Pop", "Chamber Pop", "Baroque Pop", "Power Pop", "Hyperpop", "K-Pop", "J-Pop", "C-Pop", "Latin Pop", "Other Pop"],
  "Hip-Hop": ["Trap", "Drill", "Boom Bap", "Old School Hip-Hop", "Underground Hip-Hop", "Conscious Hip-Hop", "Gangsta Rap", "Alternative Hip-Hop", "Cloud Rap", "Emo Rap", "Jazz Rap", "Lo-Fi Hip-Hop", "Hardcore Hip-Hop", "Mumble Rap", "Phonk", "Other Hip-Hop"],
  Rock: ["Classic Rock", "Alternative Rock", "Indie Rock", "Hard Rock", "Progressive Rock", "Psychedelic Rock", "Garage Rock", "Post-Rock", "Shoegaze", "Blues Rock", "Southern Rock", "Arena Rock", "Glam Rock", "Surf Rock", "Other Rock"],
  "Electronic/Dance": ["House", "Deep House", "Tech House", "Progressive House", "Electro House", "Techno", "Minimal Techno", "Trance", "Psytrance", "Dubstep", "Drum and Bass", "Breakbeat", "UK Garage", "Future Bass", "Hardstyle", "EDM", "Ambient Electronic", "Downtempo", "IDM", "Other Electronic"],
  "R&B/Soul": ["Contemporary R&B", "Alternative R&B", "Neo Soul", "Classic Soul", "Funk", "Quiet Storm", "New Jack Swing", "Blue-Eyed Soul", "Progressive Soul", "Other R&B/Soul"],
  Metal: ["Heavy Metal", "Thrash Metal", "Death Metal", "Black Metal", "Doom Metal", "Power Metal", "Progressive Metal", "Symphonic Metal", "Nu Metal", "Metalcore", "Deathcore", "Groove Metal", "Industrial Metal", "Gothic Metal", "Other Metal"],
  Jazz: ["Traditional Jazz", "Swing", "Bebop", "Hard Bop", "Cool Jazz", "Free Jazz", "Smooth Jazz", "Fusion", "Latin Jazz", "Jazz Funk", "Gypsy Jazz", "Avant-Garde Jazz", "Other Jazz"],
  Classical: ["Baroque", "Classical Period", "Romantic", "Modern Classical", "Contemporary Classical", "Minimalism", "Opera", "Chamber Music", "Orchestral", "Symphonic", "Choral", "Other Classical"],
  Country: ["Traditional Country", "Contemporary Country", "Country Pop", "Outlaw Country", "Americana", "Bluegrass", "Alt-Country", "Country Rock", "Honky Tonk", "Other Country"],
  Folk: ["Traditional Folk", "Contemporary Folk", "Indie Folk", "Folk Rock", "Singer-Songwriter", "Americana Folk", "Celtic Folk", "Other Folk"],
  Blues: ["Delta Blues", "Chicago Blues", "Electric Blues", "Acoustic Blues", "Texas Blues", "Soul Blues", "Contemporary Blues", "Other Blues"],
  Reggae: ["Roots Reggae", "Dancehall", "Dub", "Ska", "Rocksteady", "Reggae Fusion", "Lovers Rock", "Other Reggae"],
  Latin: ["Reggaeton", "Latin Pop", "Latin Trap", "Salsa", "Bachata", "Merengue", "Cumbia", "Regional Mexican", "Banda", "Norteño", "Mariachi", "Tango", "Samba", "Bossa Nova", "Other Latin"],
  Indian: ["Bollywood", "Indi-Pop", "Indian Classical", "Hindustani", "Carnatic", "Devotional", "Bhajan", "Qawwali", "Ghazal", "Sufi", "Bhangra", "Indian Folk", "Other Indian"],
  "Indie/Alternative": ["Indie Rock", "Indie Pop", "Indie Folk", "Alternative Rock", "Shoegaze", "Post-Punk", "Lo-Fi", "Noise Pop", "Other Indie"],
  Punk: ["Punk Rock", "Pop Punk", "Hardcore Punk", "Post-Punk", "Skate Punk", "Street Punk", "Anarcho Punk", "Other Punk"],
  Gospel: ["Traditional Gospel", "Contemporary Gospel", "Urban Gospel", "Southern Gospel", "Gospel Choir", "Christian Pop", "Christian Rock", "Other Gospel"],
  African: ["Afrobeats", "Afropop", "Amapiano", "Gqom", "Highlife", "Soukous", "Mbalax", "Kwaito", "Other African"],
  Asian: ["C-Pop", "Cantopop", "Mandopop", "Thai Pop", "Indonesian Pop", "Asian Indie", "Other Asian"],
  "Middle Eastern": ["Arabic Pop", "Khaliji", "Dabke", "Shaabi", "Turkish Pop", "Persian Pop", "Middle Eastern Folk", "Other Middle Eastern"],
  Ambient: ["Ambient", "Dark Ambient", "Drone", "Space Music", "New Age", "Meditative", "Other Ambient"],
  Industrial: ["Industrial Rock", "Industrial Metal", "EBM", "Darkwave", "Power Electronics", "Other Industrial"],
  "Country-Rock": ["Other"], "Jazz-Funk": ["Other"], "Hip-Hop/Rap": ["Other"], "Hip-Hop/Rock": ["Other"], "Electronic-Pop": ["Other"], "Folk-Metal": ["Other"], "Experimental Rock": ["Other"], "Avant-Garde": ["Other"], "Noise Music": ["Other"], World: ["Other"]
} as const;

export const DIRENOTE_GENRES = Object.keys(DIRENOTE_GENRE_CATALOG) as Array<keyof typeof DIRENOTE_GENRE_CATALOG>;
export const DIRENOTE_SUBGENRES_BY_GENRE: Record<string, readonly string[]> = DIRENOTE_GENRE_CATALOG;

export const DIRENOTE_LANGUAGES = [
  "English", "Hindi", "Tamil", "Telugu", "Kannada", "Malayalam", "Punjabi", "Bengali", "Marathi", "Gujarati", "Odia", "Spanish", "Arabic", "French", "German", "Italian", "Portuguese", "Chinese (Mandarin)", "Japanese", "Korean", "Russian", "Polish", "Dutch", "Swedish", "Danish", "Norwegian", "Hebrew", "Turkish", "Greek", "Romanian", "Bhojpuri", "Rajasthani", "Haryanvi", "Urdu", "Sindhi", "Kashmiri", "Nepali", "Assamese", "Santhali", "Konkani", "Instrumental", "Other"
] as const;

const FRIENDLY_GENRES: Record<string, [string, string]> = {
  Bollywood: ["Indian", "Bollywood"], Punjabi: ["Indian", "Bhangra"], Bhangra: ["Indian", "Bhangra"], Ghazal: ["Indian", "Ghazal"], Devotional: ["Indian", "Devotional"], "Indian Classical": ["Indian", "Indian Classical"], Rap: ["Hip-Hop", "Rap"], Dance: ["Electronic/Dance", "Dance"], Electronic: ["Electronic/Dance", "Electronic"], Alternative: ["Indie/Alternative", "Alternative"], "R&B": ["R&B/Soul", "R&B"]
};

export function normalizeDireNoteGenre(genre?: string | null, subgenre?: string | null) {
  const mapped = FRIENDLY_GENRES[genre?.trim() ?? ""];
  return mapped ? { genre: mapped[0], subgenre: subgenre?.trim() || mapped[1] } : { genre: genre?.trim() || "", subgenre: subgenre?.trim() || "Other" };
}

// vercel trigger
// vercel trigger 7
