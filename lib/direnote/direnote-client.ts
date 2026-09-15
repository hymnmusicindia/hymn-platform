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
  retryAfterSeconds?: number;
  contentType?: string | null;
  missing?: ReturnType<typeof getDireNoteConfig>["missing"];
};

type ProviderError = { message?: string; code?: number; reason?: string };

function parsedJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function safeResponsePreview(value: string, config: ReturnType<typeof getDireNoteConfig>) {
  const withoutMarkup = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  let safe = withoutMarkup || "No response body.";
  for (const secret of [config.pin, config.clientId]) if (secret) safe = safe.split(secret).join("[REDACTED]");
  return safe;
}

function malformedResponseError(status: number, contentType: string | null, preview: string) {
  const type = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const received = type ? ` (${type})` : "";
  if (status === 401 || status === 403) return `DIRENOTE_PROVIDER_AUTH_OR_ACCESS: DireNote returned HTTP ${status}${received}. Verify the API PIN, client ID and provider account access.`;
  if (status === 404) return `DIRENOTE_PROVIDER_ENDPOINT_NOT_FOUND: DireNote returned HTTP 404${received}. Verify DIRENOTE_INGEST_ENDPOINT.`;
  if (status >= 500) return `DIRENOTE_PROVIDER_UNAVAILABLE: DireNote returned HTTP ${status}${received}. The release remains queued and can be retried.`;
  return `DIRENOTE_MALFORMED_RESPONSE: DireNote returned HTTP ${status}${received}, not the required JSON response. Response preview: ${preview}`;
}

function nonJsonProviderFailure(status: number, contentType: string | null, preview: string) {
  if (/failed to upload license receipt/i.test(preview)) {
    return "DIRENOTE_LICENSE_RECEIPT_IMPORT_FAILED: DireNote could not import the supplied public licence PDF. The provider returned no JSON diagnostic; inspect DireNote's licence-import and storage logs.";
  }
  return malformedResponseError(status, contentType, preview);
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

    const finalPayload = { ...payload, pin: config.pin, client_id: config.clientId };
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 60_000;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Some upstream proxies do not promptly honour AbortSignal while their
    // response body is being streamed. Race the entire request (including
    // response.text()) so a stalled provider can never leave HYMN's attempt
    // permanently marked as processing.
    const request = (async () => {
      const response = await (options.fetchImpl ?? fetch)(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(finalPayload),
        signal: controller.signal
      });
      return { response, raw: await response.text() };
    })();
    const timedOut = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`DireNote request timed out after ${timeoutMs} milliseconds.`));
      }, timeoutMs);
    });
    const { response, raw } = await Promise.race([request, timedOut]);
    const contentType = response.headers.get("content-type");
    let data: any;
    try { data = JSON.parse(raw); } catch {
      const preview = safeResponsePreview(raw, config);
      const error = nonJsonProviderFailure(response.status, contentType, preview);
      return { success: false, httpStatus: response.status, contentType, raw: preview, error, providerReason: error.startsWith("DIRENOTE_LICENSE_RECEIPT_IMPORT_FAILED") ? "licenseReceiptImportFailed" : undefined };
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { success: false, httpStatus: response.status, contentType, raw: safeResponsePreview(raw, config), error: "DIRENOTE_MALFORMED_RESPONSE: DireNote returned JSON that was not an object." };
    }
    const apiRejected = data?.success === false || Boolean(data?.error) || Boolean(data?.errors);
    const providerError = apiRejected || !response.ok ? extractDireNoteProviderError(data) : {};
    let safeError = providerError.message;
    for (const secret of [config.pin, config.clientId]) if (secret) safeError = safeError?.split(secret).join("[REDACTED]");
    const retryHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryHeader ? Math.max(0, /^\d+$/.test(retryHeader) ? Number(retryHeader) : Math.ceil((Date.parse(retryHeader) - Date.now()) / 1000)) : undefined;
    return { success: response.ok && !apiRejected, httpStatus: response.status, ok: response.ok, data, raw, contentType, error: safeError, providerCode: providerError.code, providerReason: providerError.reason, retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined };
  } catch (error: any) {
    return { success: false, httpStatus: null, error: error?.name === "AbortError" ? `DireNote request timed out after ${timeoutMs} milliseconds.` : error?.message || "DireNote request failed." };
  } finally { if (timeout) clearTimeout(timeout); }
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

export function getDireNoteReleaseInformationByReference(reference: string, key: "release_id" | "distributor_release_id", options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {
  return postToDireNote(getDireNoteConfig().releaseInformationEndpoint, { [key]: normalizeIdentifier(reference) }, options);
}

export function getDireNoteRevenueReport(isrc: string, options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}) {
  return postToDireNote(getDireNoteConfig().revenueReportEndpoint, { isrc: normalizeIdentifier(isrc) }, options);
}

// vercel trigger 9
