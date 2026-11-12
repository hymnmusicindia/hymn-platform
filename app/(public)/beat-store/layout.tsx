import type { ReactNode } from "react";

/** Playback is owned by the root layout so previews survive route changes. */
export default function BeatStoreLayout({ children }: { children: ReactNode }) {
  return children;
}
