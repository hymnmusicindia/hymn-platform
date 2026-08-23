import { getDireNoteConfig } from "@/lib/direnote/direnote-config";

export type DireNoteSubmitResult = {
  success: boolean;
  httpStatus: number | null;
  ok?: boolean;
  data?: any;
  raw?: string;
  error?: string;
  providerCode?: number;
  providerReason?: string;
  missing?: ReturnType<typeof getDireNoteConfig>["missing"];
};

type ProviderError = { message?: string; code?: number; reason?: string };

function parsedJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

export function extractDireNoteProviderError(value: unknown): ProviderError {
  const parsed = parsedJson(value);
  if (typeof parsed === "string") return { message: parsed };
  if (!parsed || typeof parsed !== "object") return {};
  const record = parsed as Record<string, unknown>;
  const nested = extractDireNoteProviderError(record.error ?? record.errors);
  const firstError = Array.isArray(record.errors) ? extractDireNoteProviderError(record.errors[0]) : {};
  const code = Number(record.code ?? nested.code ?? firstError.code);
  const messageValue = record.message ?? nested.message ?? firstError.message;
  const reasonValue = record.reason ?? nested.reason ?? firstError.reason;
  return {
    message: typeof messageValue === "string" ? messageValue.trim() : undefined,
    code: Number.isFinite(code) ? code : undefined,
    reason: typeof reasonValue === "string" ? reasonValue.trim() : undefined,
  };
}

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
    const providerError = apiRejected || !response.ok ? extractDireNoteProviderError(data) : {};
    return { success: response.ok && !apiRejected, httpStatus: response.status, ok: response.ok, data, raw, error: providerError.message, providerCode: providerError.code, providerReason: providerError.reason };
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
