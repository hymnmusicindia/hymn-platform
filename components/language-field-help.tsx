import { CircleHelp } from "lucide-react";
import "./language-field-help.css";

export function LanguageFieldHelp({ track = false }: { track?: boolean }) {
  return <details className="language-field-help">
    <summary aria-label={track ? "What does track language mean?" : "What does release language mean?"}><CircleHelp size={15} aria-hidden="true" /></summary>
    <p>{track ? "Choose the language actually sung or spoken in this audio recording—not the language or script of its title. For example, a Hindi song with an English-written title is still Hindi. Choose Instrumental only when there are no sung or spoken lyrics. Each track has its own language; changing the release language does not change this field." : "Choose the main language of the release as a whole. For a single, this normally matches its track’s vocal language; for an EP or album, choose the predominant language. Each track’s actual sung or spoken language must still be set separately. This is not the language or script used to type the title."}</p>
  </details>;
}
