import { getDireNoteConfig } from "./direnote-config";
import { postToDireNote } from "./direnote-client";
import { direNoteV24Schemas, type DireNoteV24Action } from "./v24-contract";

export function requestDireNoteV24(action: DireNoteV24Action, input: unknown, options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {
  const payload = direNoteV24Schemas[action].parse(input);
  // Administrator environment configuration only. Browser requests cannot select a host.
  const base = new URL(getDireNoteConfig().endpoint);
  const endpoint = new URL(`/${action}`, base.origin);
  if (endpoint.protocol !== "https:" && !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)) throw new Error("DireNote requires HTTPS.");
  return postToDireNote(endpoint.toString(), payload, options);
}
