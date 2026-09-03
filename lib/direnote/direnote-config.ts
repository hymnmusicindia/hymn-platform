const DEFAULT_DIRENOTE_ENDPOINT = "https://api.direnotemedia.com/ingest_content";
const DEFAULT_DIRENOTE_RELEASE_INFORMATION_ENDPOINT = "https://api.direnotemedia.com/check_release_status";
const DEFAULT_DIRENOTE_REVENUE_REPORT_ENDPOINT = "https://api.direnotemedia.com/check_revenue_report";

function sanitizeConfiguredUrl(value?: string) {
  let configured = value?.trim();
  if (!configured) return undefined;

  const assignmentMatch = configured.match(/^[A-Z0-9_]+\s*=\s*(.+)$/i);
  if (assignmentMatch?.[1]) configured = assignmentMatch[1].trim();

  const markdownMatch = configured.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i);
  if (markdownMatch?.[2]) configured = markdownMatch[2].trim();

  configured = configured
    .replace(/^["'`<]+|["'`>]+$/g, "")
    .replace(/\\_/g, "_")
    .trim();

  const embeddedUrl = configured.match(/https?:\/\/[^\s)\]}>"'`]+/i);
  if (embeddedUrl?.[0]) configured = embeddedUrl[0];

  return configured;
}

function normalizeEndpoint(value: string | undefined, fallback: string) {
  const configured = sanitizeConfiguredUrl(value);
  if (!configured) return fallback;
  try {
    const url = new URL(configured);
    if (url.hostname.toLowerCase() === "dashboard.direnotemedia.com") {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

export function getDireNoteConfig() {
  const endpoint = normalizeEndpoint(
    process.env.DIRENOTE_INGEST_ENDPOINT || process.env.DISTRIBUTOR_RELEASE_ENDPOINT,
    DEFAULT_DIRENOTE_ENDPOINT,
  );
  const pin =
    process.env.DIRENOTE_API_PIN?.trim() ||
    process.env.DIRENOTE_PIN?.trim() ||
    process.env.DISTRIBUTOR_API_PIN?.trim();
  const clientId =
    process.env.DIRENOTE_CLIENT_ID?.trim() ||
    process.env.DISTRIBUTOR_CLIENT_ID?.trim() ||
    process.env.DIRENOTE_CLIENT_EMAIL?.trim();
  const releaseInformationEndpoint = normalizeEndpoint(process.env.DIRENOTE_RELEASE_INFORMATION_ENDPOINT, DEFAULT_DIRENOTE_RELEASE_INFORMATION_ENDPOINT);
  const revenueReportEndpoint = normalizeEndpoint(process.env.DIRENOTE_REVENUE_REPORT_ENDPOINT, DEFAULT_DIRENOTE_REVENUE_REPORT_ENDPOINT);

  return {
    endpoint,
    releaseInformationEndpoint,
    revenueReportEndpoint,
    pin,
    clientId,
    isConfigured: Boolean(endpoint && pin && clientId),
    missing: { endpoint: !endpoint, pin: !pin, clientId: !clientId }
  };
}

// vercel trigger 8
