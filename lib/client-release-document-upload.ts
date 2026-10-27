import { normalizeUploadMime } from "./upload-mime";
import { documentChunkSize, releaseDocumentPolicies, type ReleaseDocumentType } from "./release-document-policy";

class UploadResponseError extends Error { constructor(message: string, readonly status: number) { super(message); } }
// Documents use small binary chunks, rather than repeatedly sending the whole
// multipart request through the hosting proxy. The manifest permits safe resume.
export async function uploadReleaseDocument(file: File, assetType: ReleaseDocumentType, options: {releaseId: number; signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void}) {
  const policy = releaseDocumentPolicies[assetType];
  const mimeType = normalizeUploadMime(file.type, file.name);
  if (!(policy.mimeTypes as readonly string[]).includes(mimeType) || file.size < 1 || file.size > policy.maxBytes) throw new Error(assetType === "private_cover_licence" ? "Choose a PDF, JPG or PNG no larger than 20 MB." : "Choose a PDF no larger than 10 MB.");
  const retry = async <T,>(operation: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      options.signal?.throwIfAborted();
      try { return await operation(); } catch (error) {
        if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
        if (error instanceof UploadResponseError && error.status < 500 && error.status !== 408 && error.status !== 429) throw error;
        if (attempt === 2) {
          if (error instanceof UploadResponseError) throw error;
          throw new Error("The document upload was interrupted. Select the same file to resume. If it still fails, contact HYMN support with the release name.");
        }
        await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  };
  const json = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {...init, signal: options.signal ?? AbortSignal.timeout(60000)});
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new UploadResponseError(body.error || (response.status === 413 ? "The upload service rejected this request size. Please contact HYMN support." : response.status === 401 ? "Your session expired. Sign in again before uploading." : `Document upload failed (HTTP ${response.status}).`), response.status);
    return {body, status: response.status};
  };
  const hashes: string[] = [];
  for (let offset = 0; offset < file.size; offset += documentChunkSize) {
    options.signal?.throwIfAborted();
    const digest = await crypto.subtle.digest("SHA-256", await file.slice(offset, offset + documentChunkSize).arrayBuffer());
    hashes.push(Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,"0")).join(""));
  }
  const {body: created} = await retry(() => json("/api/uploads/sessions", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({releaseId:options.releaseId, assetCategory:policy.category, originalFilename:file.name, mimeType, totalSize:file.size, chunkHashes:hashes})}));
  const session = created.session;
  if (!session?.id || session.chunkSize !== documentChunkSize || session.totalChunks !== hashes.length) throw new Error("Document upload configuration is unavailable. Refresh the page and try again.");
  const uploaded = new Set<number>(session.uploadedChunks || []);
  let loaded = 0;
  for (let index = 0; index < hashes.length; index++) {
    const chunk = file.slice(index * documentChunkSize, (index + 1) * documentChunkSize);
    if (!uploaded.has(index)) await retry(() => json(`/api/uploads/sessions/${session.id}/chunks/${index}`, {method:"PUT", headers:{"Content-Type":"application/octet-stream"}, body:chunk}));
    loaded += chunk.size; options.onProgress?.(loaded, file.size);
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    const {body, status} = await retry(() => json(`/api/uploads/sessions/${session.id}/complete`, {method:"POST"}));
    if (body.asset?.downloadPath) return body.asset.downloadPath as string;
    if (status !== 202) throw new Error("The document upload completed without an attachment. Retry the same file to resume.");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Your document is still processing. Retry the same file to resume the upload.");
}
