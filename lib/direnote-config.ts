export const DIRENOTE_INGEST_ENDPOINT = "https://dashboard.direnotemedia.com/ingest_api";

export const DIRENOTE_CONTENT_TYPES = ["Original/Exclusive Licensed", "AI Generated", "Non-Exclusive Licensed"] as const;
export type DireNoteContentType = typeof DIRENOTE_CONTENT_TYPES[number];

export const DIRENOTE_GENRES = [
  "Pop", "Hip-Hop", "Rock", "Electronic/Dance", "R&B/Soul", "Metal", "Jazz", "Classical", "Country", "Folk", "Blues", "Reggae", "Latin", "Indian", "Indie/Alternative", "Punk", "Gospel", "African", "Asian", "Middle Eastern", "Ambient", "Industrial", "World"
] as const;

const common = ["Other"];
export const DIRENOTE_SUBGENRES_BY_GENRE: Record<string, string[]> = {
  Pop: ["Pop", "Dance Pop", "Indie Pop", ...common],
  "Hip-Hop": ["Hip-Hop", "Rap", "Trap", ...common],
  Rock: ["Rock", "Alternative Rock", "Indie Rock", ...common],
  "Electronic/Dance": ["Electronic", "Dance", "EDM", "House", "Techno", ...common],
  "R&B/Soul": ["R&B", "Soul", "Contemporary R&B", ...common],
  Metal: ["Metal", ...common], Jazz: ["Jazz", "Fusion", ...common], Classical: ["Classical", "Opera", ...common], Country: ["Country", ...common], Folk: ["Folk", ...common], Blues: ["Blues", ...common], Reggae: ["Reggae", "Dancehall", ...common], Latin: ["Latin", ...common],
  Indian: ["Bollywood", "Bhangra", "Ghazal", "Devotional", "Indian Classical", "Carnatic", "Hindustani", "Indian Folk", "Indian Pop", "Bhajan", "Kirtan", ...common],
  "Indie/Alternative": ["Alternative", "Indie", "Singer/Songwriter", ...common], Punk: ["Punk", ...common], Gospel: ["Gospel", ...common], African: ["African", ...common], Asian: ["Asian", ...common], "Middle Eastern": ["Middle Eastern", ...common], Ambient: ["Ambient", "Downtempo", ...common], Industrial: ["Industrial", ...common], World: ["World", "Fusion", "Soundtrack", ...common]
};

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
