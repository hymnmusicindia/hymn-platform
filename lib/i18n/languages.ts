export const languages = [
  ["en", "English"], ["hi", "Hindi"], ["mr", "Marathi"], ["pa", "Punjabi"],
  ["bn", "Bengali"], ["bho", "Bhojpuri"], ["har", "Haryanvi"], ["gu", "Gujarati"],
  ["ta", "Tamil"], ["te", "Telugu"], ["kn", "Kannada"], ["ml", "Malayalam"],
  ["ur", "Urdu"], ["other", "Other"]
] as const;

export type LanguageCode = typeof languages[number][0];
export const languageCodes = new Set<string>(languages.map(([code]) => code));

