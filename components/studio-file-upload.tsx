"use client";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { UploadDropzone } from "@/components/upload-dropzone";

export function StudioFileUpload({ orderPublicId, role, onUploaded }: { orderPublicId: string; role: "SOURCE" | "DELIVERY"; onUploaded?: () => void }) {
  const router = useRouter();
  const source = role === "SOURCE";
  return <UploadDropzone
    accept="audio/wav,audio/x-wav,audio/flac,audio/mpeg,application/zip,.wav,.flac,.mp3,.zip"
    title={source ? "Source package" : "Delivery files"}
    description={source ? "Upload consolidated stems, multitracks, or a ZIP package" : "Upload the final WAV, MP3, or delivery ZIP"}
    helperLines={source ? ["Private", "WAV, FLAC, MP3, ZIP", "Resumable upload"] : ["Private", "Release-ready audio", "Versioned delivery"]}
    onSelect={async (file, controls) => {
      const assetType = source ? "private_studio_source" : "private_studio_delivery";
      const blob = await upload(`studio/${orderPublicId}/${crypto.randomUUID()}-${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/assets/client-upload",
        multipart: file.size > 5 * 1024 * 1024,
        clientPayload: JSON.stringify({ studioOrderId: orderPublicId, assetType, mimeType: file.type || "application/octet-stream", originalFilename: file.name, byteSize: file.size }),
        onUploadProgress: event => controls.reportProgress(event.loaded, event.total),
      });
      if (controls.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
      for (let attempt=0;attempt<6;attempt++) {
        if (controls.signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
        const response = await fetch("/api/assets/client-upload/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: blob.url }), signal: controls.signal });
        const data = await response.json();
        if (response.ok) break;
        if (response.status !== 409 || attempt === 5) throw new Error(data.error || "The uploaded file could not be attached.");
        await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
      }
      if (onUploaded) onUploaded(); else router.refresh();
    }}
  />;
}
