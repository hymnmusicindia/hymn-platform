import 'server-only';
import { getDireNoteConfig } from './direnote-config';
import { postToDireNote, type DireNoteSubmitResult } from './direnote-client';
import { reserveDireNoteRequest } from '../direnote-rate-limit';
import type { ReleaseCorrection } from '../release-correction-contract';

export async function requestDireNoteCorrection(action: ReleaseCorrection['action'] | 'list_support_requests', payload: Record<string, unknown>, file?: { bytes: Buffer; fileName: string; mimeType: string }, fetchImpl: typeof fetch = fetch): Promise<DireNoteSubmitResult> {
  const config = getDireNoteConfig();
  if (!config.isConfigured) throw Error('Distribution partner credentials are not configured.');
  const endpoint = new URL(`/${action}`, new URL(config.endpoint).origin);
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) throw Error('Distribution requests require HTTPS.');
  await reserveDireNoteRequest(action);
  if (!file) return postToDireNote(endpoint.toString(), payload, { fetchImpl });
  const body = new FormData();
  body.set('client_id', config.clientId!); body.set('pin', config.pin!);
  body.set('isrc', String(payload.isrc));
  body.set('file', new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }), file.fileName);
  try {
    const response = await fetchImpl(endpoint, { method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(90000) });
    const data = await response.json().catch(() => null);
    return { success: response.ok && data?.success === true, httpStatus: response.status, data, error: response.ok && data?.success === true ? undefined : `Partner correction request was not confirmed (HTTP ${response.status}).` };
  } catch { return { success: false, httpStatus: null, error: 'Partner correction outcome is uncertain. Reconcile the request before sending again.' }; }
}
