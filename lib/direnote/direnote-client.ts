import { getDireNoteConfig } from "@/lib/direnote/direnote-config";

export type DireNoteSubmitResult = {
  success: boolean;
  httpStatus: number | null;
  ok?: boolean;
  data?: any;
  raw?: string;
  error?: string;
  missing?: ReturnType<typeof getDireNoteConfig>["missing"];
};

async function postToDireNote(endpoint: string, payload: Record<string, unknown>, options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<DireNoteSubmitResult> {
  const config = getDireNoteConfig();
  if (!config.isConfigured) return { success: false, httpStatus: null, error: "DireNote credentials are not configured.", missing: config.missing };

  const finalPayload = { pin: config.pin, client_id: config.clientId, ...payload };
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 60_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(finalPayload),
      signal: controller.signal
    });
    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = { raw }; }
    const apiRejected = data?.success === false || Boolean(data?.error) || Boolean(data?.errors);
    return { success: response.ok && !apiRejected, httpStatus: response.status, ok: response.ok, data, raw };
  } catch (error: any) {
    return { success: false, httpStatus: null, error: error?.name === "AbortError" ? `DireNote request timed out after ${timeoutMs} milliseconds.` : error?.message || "DireNote request failed." };
  } finally { clearTimeout(timeout); }
}

export function submitToDireNote(payload: Record<string, unknown>, options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {
  return postToDireNote(getDireNoteConfig().endpoint, payload, options);
}

function normalizeIdentifier(value: string) {
  return value.replace(/[\s-]+/g, "").toUpperCase();
}

export function getDireNoteReleaseInformation(upc: string, options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {
  return postToDireNote(getDireNoteConfig().releaseInformationEndpoint, { upc: normalizeIdentifier(upc) }, options);
}

export function getDireNoteRevenueReport(isrc: string, options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {
  return postToDireNote(getDireNoteConfig().revenueReportEndpoint, { isrc: normalizeIdentifier(isrc) }, options);
}

// vercel trigger 9
