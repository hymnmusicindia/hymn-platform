const DEFAULT_DIRENOTE_ENDPOINT = "https://dashboard.direnotemedia.com/ingest_api";

export function getDireNoteConfig() {
  const endpoint =
    process.env.DIRENOTE_INGEST_ENDPOINT?.trim() ||
    process.env.DISTRIBUTOR_RELEASE_ENDPOINT?.trim() ||
    DEFAULT_DIRENOTE_ENDPOINT;
  const pin =
    process.env.DIRENOTE_API_PIN?.trim() ||
    process.env.DIRENOTE_PIN?.trim() ||
    process.env.DISTRIBUTOR_API_PIN?.trim();
  const clientId =
    process.env.DIRENOTE_CLIENT_ID?.trim() ||
    process.env.DISTRIBUTOR_CLIENT_ID?.trim() ||
    process.env.DIRENOTE_CLIENT_EMAIL?.trim();

  return {
    endpoint,
    pin,
    clientId,
    isConfigured: Boolean(endpoint && pin && clientId),
    missing: { endpoint: !endpoint, pin: !pin, clientId: !clientId }
  };
}

// vercel trigger 8
