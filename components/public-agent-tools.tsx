"use client";

import { useEffect } from "react";
import { publicAgentTools, executePublicAgentTool } from "@/lib/public-agent-tools";

type Context = {
  registerTool: (tool: (typeof publicAgentTools)[number] & { execute: (input: unknown) => Promise<unknown> }, options?: { signal: AbortSignal }) => void | Promise<void>;
  unregisterTool?: (name: string) => void;
};

export function PublicAgentTools() {
  useEffect(() => {
    // Current draft uses document; Chromium's earlier experiment used navigator.
    const modern = (document as Document & { modelContext?: Context }).modelContext;
    const context = modern || (navigator as Navigator & { modelContext?: Context }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    const registered: string[] = [];
    for (const tool of publicAgentTools) {
      const browserTool = { ...tool, execute: async (input: unknown) => executePublicAgentTool(tool.name, input, window.location.origin) };
      try {
        const registration = context.registerTool(browserTool, { signal: controller.signal });
        if (!registration) { registered.push(tool.name); continue; }
        Promise.resolve(registration).then(() => {
          if (controller.signal.aborted) { if (!modern) context.unregisterTool?.(tool.name); }
          else registered.push(tool.name);
        }).catch(() => { /* Experimental API unavailable or registration rejected. Normal pages remain usable. */ });
      } catch { /* Older browser experiments may reject an unsupported tool. */ }
    }
    return () => { controller.abort(); if (!modern) registered.forEach(name => context.unregisterTool?.(name)); };
  }, []);
  return null;
}
