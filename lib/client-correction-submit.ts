// A timed-out response does not mean the correction failed to commit. Reconcile
// only the exact schema-parsed package; never automatically repeat the POST.
export async function submitCorrectionPackage(metadata: { editReleaseId: number }, body: FormData, fetcher: typeof fetch = fetch, timeoutMs = 90_000) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(metadata)));
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  try {
    const response = await fetcher('/api/distribution/update-release', { method: 'POST', body, signal: AbortSignal.timeout(timeoutMs) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not submit corrections.');
    return data;
  } catch (error) {
    try {
      const response = await fetcher(`/api/distribution/payment/status?releaseId=${metadata.editReleaseId}&correctionKey=${key}`, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
      const data = await response.json();
      if (response.ok && data.correctionReceived && data.release) return { release: data.release, recovered: true };
    } catch { /* Keep the original failure; no second mutation. */ }
    if (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) throw new Error('Correction confirmation timed out. Open Your Releases to check whether your changes were received before retrying. Your payment is safe; do not pay again.');
    throw error;
  }
}
