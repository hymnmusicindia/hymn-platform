const DEFAULT_DIRENOTE_ENDPOINT = "https://api.direnotemedia.com/ingest_content";
const DEFAULT_DIRENOTE_RELEASE_INFORMATION_ENDPOINT = "https://api.direnotemedia.com/check_release_status";
const DEFAULT_DIRENOTE_REVENUE_REPORT_ENDPOINT = "https://api.direnotemedia.com/check_revenue_report";

function normalizeIngestionEndpoint(value?: string) {
  const configured = value?.trim();
  if (!configured) return DEFAULT_DIRENOTE_ENDPOINT;
  try {
    const url = new URL(configured);
    if (url.hostname.toLowerCase() === "dashboard.direnotemedia.com") {
      return DEFAULT_DIRENOTE_ENDPOINT;
    }
    return url.toString();
  } catch {
    return configured;
  }
}

export function getDireNoteConfig() {
  const endpoint = normalizeIngestionEndpoint(
    process.env.DIRENOTE_INGEST_ENDPOINT || process.env.DISTRIBUTOR_RELEASE_ENDPOINT,
  );
  const pin =
    process.env.DIRENOTE_API_PIN?.trim() ||
    process.env.DIRENOTE_PIN?.trim() ||
    process.env.DISTRIBUTOR_API_PIN?.trim();
  const clientId =
    process.env.DIRENOTE_CLIENT_ID?.trim() ||
    process.env.DISTRIBUTOR_CLIENT_ID?.trim() ||
    process.env.DIRENOTE_CLIENT_EMAIL?.trim();
  const releaseInformationEndpoint = process.env.DIRENOTE_RELEASE_INFORMATION_ENDPOINT?.trim() || DEFAULT_DIRENOTE_RELEASE_INFORMATION_ENDPOINT;
  const revenueReportEndpoint = process.env.DIRENOTE_REVENUE_REPORT_ENDPOINT?.trim() || DEFAULT_DIRENOTE_REVENUE_REPORT_ENDPOINT;

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
