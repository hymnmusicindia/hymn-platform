import { CircleHelp } from "lucide-react";
import "./language-field-help.css";

export function LanguageFieldHelp({ track = false }: { track?: boolean }) {
  return <details className="language-field-help">
    <summary aria-label={track ? "What does track language mean?" : "What does release language mean?"}><CircleHelp size={15} aria-hidden="true" /></summary>
    <p>{track ? "Choose the language actually sung or spoken in this audio recording—not the language or script of its title. For example, “Ye Zindagi Na Milegi Tujhe Phir Kabhi” is a Hindi title transliterated into Latin (English) letters—not an English-language title. If the recording is sung in Hindi, select Hindi here. Choose Instrumental only when there are no sung or spoken lyrics. Each track has its own language; changing the release language does not change this field." : "Choose the main language of the release as a whole. For a single, this normally matches its track’s vocal language; for an EP or album, choose the predominant language. Each track’s actual sung or spoken language must still be set separately. For a Hindi single such as “Ye Zindagi Na Milegi Tujhe Phir Kabhi”, select Hindi for both release language and track language—even though its title uses Latin (English) letters. DireNote has no separate title-language field."}</p>
  </details>;
}
