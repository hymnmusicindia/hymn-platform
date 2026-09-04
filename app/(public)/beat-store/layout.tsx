import { BeatPreviewPlayerProvider } from "@/components/beat-preview-player";
import type { ReactNode } from "react";

export default function BeatStoreLayout({ children }: { children: ReactNode }) {
  return <BeatPreviewPlayerProvider>{children}</BeatPreviewPlayerProvider>;
}
