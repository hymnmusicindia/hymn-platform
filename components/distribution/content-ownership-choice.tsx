"use client";

import { DIRENOTE_CONTENT_TYPES } from "@/lib/direnote-config";
import styles from "./content-ownership-choice.module.css";

const descriptions: Record<string, string> = {
  "Original/Exclusive Licensed": "You own this recording or hold an exclusive licence to distribute it.",
  "AI Generated": "This recording uses AI-generated music. A generation receipt and track or project link are required.",
  "Non-Exclusive Licensed": "You use music under a non-exclusive licence, such as a leased beat. Your licence or agreement is required.",
};

export function ContentOwnershipChoice({ value, onChange, invalid, label }: {
  value: string; onChange: (value: string) => void; invalid: boolean; label: React.ReactNode;
}) {
  return <fieldset className={styles.panel} aria-describedby="content-ownership-description" aria-invalid={invalid || undefined}>
    <legend className={styles.legend}>{label}<span>Required</span></legend>
    <p id="content-ownership-description" className={styles.description}>Tell us who owns this recording and how you have permission to distribute it.</p>
    <div className={styles.choices}>
      {DIRENOTE_CONTENT_TYPES.map(option => <label key={option} className={styles.choice} data-selected={value === option || undefined}>
        <input type="radio" name="content-ownership" value={option} checked={value === option} onChange={() => onChange(option)} required />
        <span><strong>{option === "Original/Exclusive Licensed" ? "Original / exclusively licensed" : option === "AI Generated" ? "AI-generated music" : "Non-exclusively licensed"}</strong><span>{descriptions[option]}</span></span>
      </label>)}
    </div>
  </fieldset>;
}
