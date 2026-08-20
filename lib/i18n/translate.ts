import { getDictionary } from "./dictionary";
import type { LanguageCode } from "./languages";

export function translate(language: LanguageCode, key: keyof ReturnType<typeof getDictionary>) {
  return getDictionary(language)[key];
}

