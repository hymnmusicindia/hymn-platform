"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const ReleaseNavigationTarget = createContext<HTMLElement | null | undefined>(undefined);

/** Keep editor state in the form while placing its navigation above the page. */
export function ReleaseNavigationSlot({ children }: { children: ReactNode }) {
  const target = useContext(ReleaseNavigationTarget);
  if (target === undefined) return children;
  return target ? createPortal(children, target) : null;
}
