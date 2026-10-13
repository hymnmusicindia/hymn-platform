"use client";
const chunkSize = 8 * 1024 * 1024;
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
export async function uploadStudioFile(file: File, orderId: string, role: "SOURCE" | "DELIVERY", controls: { signal: AbortSignal; reportProgress: (loaded: number, total: number) => void }) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const mime = ({ wav: "audio/wav", mp3: "audio/mpeg", flac: "audio/flac", zip: "application/zip" } as Record<string, string>)[extension || ""];
  const maximum = (role === "SOURCE" ? 2048 : 500) * 1024 ** 2;
  if (!mime || !file.size || file.size > maximum) throw new Error(`Choose a WAV, FLAC, MP3 or ZIP under ${role === "SOURCE" ? "2 GB" : "500 MB"}.`);
  const fingerprint = await digest(await new Blob([file.slice(0, 65536), file.slice(Math.max(0, file.size - 65536)), `${file.name}:${file.size}:${file.lastModified}`]).arrayBuffer());
  const storageKey = `studio-upload:${orderId}:${role}:${fingerprint}`;
  async function post(body: unknown) {
    const response = await fetch("/api/studio/uploads", { method: "POST", headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" }, body: body instanceof FormData ? body : JSON.stringify(body), signal: controls.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Upload failed. Please retry.");
    return data;
  }
  let token = "", uploaded: number[] = [];
  try { token = sessionStorage.getItem(storageKey) || ""; } catch { /* Storage can be disabled by the browser. */ }
  if (token) {
    try { uploaded = (await post({ action: "status", token })).uploadedChunks; }
    catch (error) { if (controls.signal.aborted) throw error; token = ""; }
  }
  if (!token) {
    token = (await post({ action: "create", orderId, role, filename: file.name, mime, size: file.size })).token;
    try { sessionStorage.setItem(storageKey, token); } catch { /* Retry remains available during this selection. */ }
  }
  for (let index = 0; index < Math.ceil(file.size / chunkSize); index++) {
    if (controls.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
    if (!uploaded.includes(index)) {
      const chunk = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
      const form = new FormData(); form.set("token", token); form.set("index", String(index)); form.set("chunk", chunk); form.set("checksum", await digest(await chunk.arrayBuffer()));
      for (let attempt = 0; ; attempt++) {
        try { await post(form); break; }
        catch (error) { if (controls.signal.aborted || attempt >= 2) throw error; }
      }
    }
    controls.reportProgress(Math.min(file.size, (index + 1) * chunkSize), file.size);
  }
  const result = await post({ action: "complete", token });
  try { sessionStorage.removeItem(storageKey); } catch { /* No persistent cache was available. */ }
  return result.asset;
}
