"use client";

import { createContext, useContext } from "react";

const SubscriptionLabelContext = createContext("Subscriptions");

export function SubscriptionLabelProvider({ label, children }: { label: string; children: React.ReactNode }) {
  return <SubscriptionLabelContext.Provider value={label}>{children}</SubscriptionLabelContext.Provider>;
}

export function useSubscriptionLabel() {
  return useContext(SubscriptionLabelContext);
}
